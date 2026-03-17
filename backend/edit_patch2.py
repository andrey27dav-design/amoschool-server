#!/usr/bin/env python3
"""Apply migration fixes using exact line-number ranges (0-indexed slices)."""

BATCH = '/var/www/amoschool/backend/src/services/batchMigrationService.js'
KOMMO = '/var/www/amoschool/backend/src/services/kommoApi.js'

def read(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.readlines()

def write(path, lines):
    with open(path, 'w', encoding='utf-8') as f:
        f.writelines(lines)

def make_lines(text):
    """Convert a multi-line string into a list of lines ending with \\n."""
    parts = text.split('\n')
    result = []
    for i, part in enumerate(parts):
        if i < len(parts) - 1:
            result.append(part + '\n')
        elif part:  # last part if non-empty
            result.append(part + '\n')
    return result

# ═══════════════════════════════════════════════════════════════════════
# batchMigrationService.js
# ═══════════════════════════════════════════════════════════════════════
batch = read(BATCH)
print(f"batchMigrationService.js: {len(batch)} lines")
# Verify key lines
print("L670:", batch[669].rstrip())
print("L706:", batch[705].rstrip())
print("L708:", batch[707].rstrip())
print("L732:", batch[731].rstrip())
print("L734:", batch[733].rstrip())
print("L750:", batch[749].rstrip())

# ── FIX 1: lead creation, lines 670-706 (0-based: 669:706) ───────────
FIX1 = """\
    if (leadsToCreate.length > 0) {
      try {
        const { transformLead } = require('../utils/dataTransformer');
        const leadsForKommo = leadsToCreate.map(lead => {
          const t = transformLead(lead, stageMapping || {}, fieldMappings.leads);
          t.pipeline_id = config.kommo.pipelineId;
          // ── Передаём contacts и companies в _embedded при СОЗДАНИИ сделки ──
          // В Kommo API PATCH _embedded.contacts работает ненадёжно;
          // единственный гарантированный способ — включить их в POST /api/v4/leads
          const embContacts = [];
          const embCompanies = [];
          for (const c of ((lead._embedded && lead._embedded.contacts) || [])) {
            const kId = contactIdMap[String(c.id)];
            if (kId) {
              embContacts.push({ id: kId });
            } else {
              logger.warn(`Lead AMO#${lead.id}: контакт AMO#${c.id} не найден в contactIdMap — привязка пропущена`);
            }
          }
          for (const c of ((lead._embedded && lead._embedded.companies) || [])) {
            const kId = companyIdMap[String(c.id)];
            if (kId) {
              embCompanies.push({ id: kId });
            } else {
              logger.warn(`Lead AMO#${lead.id}: компания AMO#${c.id} не найдена в companyIdMap — привязка пропущена`);
            }
          }
          const emb = { ...(t._embedded || {}) };
          if (embContacts.length > 0)  emb.contacts  = embContacts;
          if (embCompanies.length > 0) emb.companies = embCompanies;
          t._embedded = emb;
          return t;
        });
        const created = await kommoApi.createLeadsBatch(leadsForKommo);
        const pairs = [];
        for (let i = 0; i < created.length; i++) {
          const k = created[i], a = leadsToCreate[i];
          if (!k || !a) continue;
          leadIdMap[String(a.id)] = k.id;
          result.createdIds.leads.push(k.id);
          result.transferred.leads++;
          pairs.push({ amoId: a.id, kommoId: k.id });
          logger.info(`[transfer] Lead AMO#${a.id} → Kommo#${k.id}: contacts=${(a._embedded?.contacts||[]).length}, companies=${(a._embedded?.companies||[]).length}`);
        }
        safety.registerMigratedBatch('leads', pairs);
      } catch (e) { result.errors.push('Сделки: ' + e.message); }
    }
"""
batch = batch[:669] + make_lines(FIX1.rstrip('\n')) + batch[706:]
print(f"FIX 1 done: leads creation. Now {len(batch)} lines")

# Recalculate line offsets
# Original lines 670-706 = 37 lines. FIX1 has how many lines?
fix1_count = len(make_lines(FIX1.rstrip('\n')))
offset1 = fix1_count - 37
print(f"FIX1 line count: {fix1_count}, offset: {offset1}")
# New positions: tasks section was at 708-732, now at 708+offset1 to 732+offset1
t_start = 708 + offset1  # tasks comment line
t_end_excl = 733 + offset1  # line after tasks closing brace (exclusive, 1-based → 0-based: t_end_excl-1)

print(f"Tasks section now lines {t_start}-{t_end_excl-1} (1-based)")
print("Tasks comment:", batch[t_start-1].rstrip())
print("Tasks end:", batch[t_end_excl-2].rstrip())

# ── FIX 2: tasks section, original lines 708-732 ─────────────────────
FIX2 = """\

    // ── Tasks (from cache) ───────────────────────────────────────────────────────
    // Number() cast защищает от несоответствия типов string/number в Set.has()
    const selectedIds = new Set(selectedLeads.map(l => Number(l.id)));
    const dealTasks = allTasks.filter(
      t => t.entity_type === 'leads' && selectedIds.has(Number(t.entity_id))
    );
    logger.info(`[transfer] задач в кэше: ${dealTasks.length} (selectedLeads: ${selectedLeads.length}, leadIdMap keys: ${Object.keys(leadIdMap).length})`);
    if (dealTasks.length > 0) {
      try {
        const { transformTask } = require('../utils/dataTransformer');
        const tasksToCreate = dealTasks
          .map(t => {
            const tt = transformTask(t);
            tt.entity_id   = leadIdMap[String(t.entity_id)];
            tt.entity_type = 'leads';
            return tt;
          })
          .filter(t => t.entity_id);
        if (tasksToCreate.length < dealTasks.length) {
          const lost = dealTasks.length - tasksToCreate.length;
          result.warnings.push(lost + ' задач потеряли привязку (сделка не создана в этом переносе).');
          logger.warn(`[transfer] ${lost} задач без entity_id в leadIdMap`);
        }
        logger.info(`[transfer] создаём ${tasksToCreate.length} задач в Kommo`);
        const created = await kommoApi.createTasksBatch(tasksToCreate);
        logger.info(`[transfer] createTasksBatch вернул ${created.length} объектов`);
        created.forEach(k => { if (k) { result.createdIds.tasks.push(k.id); result.transferred.tasks++; } });
      } catch (e) {
        result.warnings.push('Задачи: ' + e.message);
        logger.error('[transfer] ошибка задач:', e.message);
      }
    }
"""
# t_start-1 is the blank line 707 (0-based: t_start-2)
# We replace from blank line 707 through tasks closing brace line 732
# 0-based: [t_start-2 : t_end_excl-1]
batch = batch[:t_start-2] + make_lines(FIX2.rstrip('\n')) + batch[t_end_excl-1:]
print(f"FIX 2 done: tasks. Now {len(batch)} lines")

fix2_count = len(make_lines(FIX2.rstrip('\n')))
# Original range length: t_end_excl-1 - (t_start-2) = t_end_excl - t_start + 1
orig2_count = t_end_excl - t_start + 1
offset2 = fix2_count - orig2_count
print(f"FIX2: replaced {orig2_count} lines with {fix2_count}, offset={offset2}")

# Notes lead section was originally at 734-750
# After offset1 shift and then replacing from t_start-2..t_end_excl-1
n_start = 734 + offset1 + offset2
n_end_excl = 751 + offset1 + offset2
print(f"Notes (lead) section now lines {n_start}-{n_end_excl-1} (1-based)")
print("Notes comment:", batch[n_start-1].rstrip())
print("Notes end:", batch[n_end_excl-2].rstrip())

# ── FIX 3: notes (lead) section, original lines 734-750 ──────────────
# We add logging for AMO notes count and createNotesBatch result
FIX3 = """\

    // ── Notes: lead notes (live fetch from AMO) ──────────────────────────────────────────
    for (const aLead of selectedLeads) {
      const kId = leadIdMap[String(aLead.id)];
      if (!kId) { logger.warn(`[transfer] notes(lead): нет kommo id для AMO#${aLead.id}`); continue; }
      try {
        const notes = await amoApi.getLeadNotes(aLead.id);
        logger.info(`[transfer] AMO lead #${aLead.id}: ${notes.length} заметок`);
        if (notes.length > 0) {
          const notesData = notes.map(n => ({
            entity_id:  kId,
            note_type:  n.note_type || 'common',
            params:     n.params    || {},
          }));
          const created = await kommoApi.createNotesBatch('leads', notesData);
          logger.info(`[transfer] createNotesBatch(leads) вернул ${created.length} объектов`);
          created.forEach(n => { if (n) { result.createdIds.notes.push(n.id); result.transferred.notes++; } });
        }
      } catch (e) {
        result.warnings.push('Заметки сделки AMO#' + aLead.id + ': ' + e.message);
        logger.error('[transfer] ошибка заметок AMO#' + aLead.id + ':', e.message);
      }
    }
"""
batch = batch[:n_start-2] + make_lines(FIX3.rstrip('\n')) + batch[n_end_excl-1:]
print(f"FIX 3 done: lead notes. Now {len(batch)} lines")

write(BATCH, batch)
print("batchMigrationService.js saved.\n")

# ═══════════════════════════════════════════════════════════════════════
# kommoApi.js
# ═══════════════════════════════════════════════════════════════════════
kommo = read(KOMMO)
print(f"kommoApi.js: {len(kommo)} lines")

# Read lines to find function boundaries
for i, l in enumerate(kommo):
    if 'async function createTasksBatch' in l:
        tasks_fn = i  # 0-based
    if 'async function createNotesBatch' in l:
        notes_fn = i

print(f"createTasksBatch at line {tasks_fn+1} (0-based {tasks_fn})")
print(f"createNotesBatch at line {notes_fn+1} (0-based {notes_fn})")

def find_fn_end_0based(lines, start_0based):
    depth = 0
    for i in range(start_0based, len(lines)):
        for ch in lines[i]:
            if ch == '{': depth += 1
            elif ch == '}': depth -= 1
        if depth == 0 and i > start_0based:
            return i  # 0-based inclusive end
    return None

tasks_fn_end = find_fn_end_0based(kommo, tasks_fn)
notes_fn_end = find_fn_end_0based(kommo, notes_fn)
print(f"createTasksBatch: lines {tasks_fn+1}-{tasks_fn_end+1}")
print(f"createNotesBatch: lines {notes_fn+1}-{notes_fn_end+1}")

# ── FIX 4: createTasksBatch ───────────────────────────────────────────
FIX4 = """\
async function createTasksBatch(tasks) {
  const chunks = [];
  for (let i = 0; i < tasks.length; i += 50) chunks.push(tasks.slice(i, i + 50));
  const created = [];
  for (const chunk of chunks) {
    await rateLimit();
    try {
      const res = await kommoClient.post('/api/v4/tasks', chunk);
      const embedded = res.data._embedded?.tasks || [];
      logger.info(`Kommo createTasksBatch: HTTP ${res.status}, tasks=${embedded.length}, resp_keys=${Object.keys(res.data||{}).join(',')}`);
      created.push(...embedded);
    } catch (e) {
      const body = e.response?.data ? JSON.stringify(e.response.data).slice(0,300) : e.message;
      logger.error(`Kommo createTasksBatch error: ${body}`);
      throw e;
    }
  }
  logger.info(`Kommo createTasksBatch: returning ${created.length} total`);
  return created;
}
"""
kommo = kommo[:tasks_fn] + make_lines(FIX4.rstrip('\n')) + kommo[tasks_fn_end+1:]
print(f"FIX 4 done: createTasksBatch. Now {len(kommo)} lines")

# Recalculate notes_fn position
fix4_count = len(make_lines(FIX4.rstrip('\n')))
orig4_count = tasks_fn_end - tasks_fn + 1
offset4 = fix4_count - orig4_count
notes_fn_new = notes_fn + offset4
notes_fn_end_new = find_fn_end_0based(kommo, notes_fn_new)
print(f"createNotesBatch now at lines {notes_fn_new+1}-{notes_fn_end_new+1}")

# ── FIX 5: createNotesBatch ──────────────────────────────────────────
FIX5 = """\
async function createNotesBatch(entityType, notes) {
  const chunks = [];
  for (let i = 0; i < notes.length; i += 50) chunks.push(notes.slice(i, i + 50));
  const created = [];
  for (const chunk of chunks) {
    await rateLimit();
    try {
      const res = await kommoClient.post(`/api/v4/${entityType}/notes`, chunk);
      const embedded = res.data._embedded?.notes || [];
      logger.info(`Kommo createNotesBatch(${entityType}): HTTP ${res.status}, notes=${embedded.length}`);
      created.push(...embedded);
    } catch (e) {
      const body = e.response?.data ? JSON.stringify(e.response.data).slice(0,300) : e.message;
      logger.error(`Kommo createNotesBatch(${entityType}) error: ${body}`);
      throw e;
    }
  }
  logger.info(`Kommo createNotesBatch(${entityType}): returning ${created.length} total`);
  return created;
}
"""
kommo = kommo[:notes_fn_new] + make_lines(FIX5.rstrip('\n')) + kommo[notes_fn_end_new+1:]
print(f"FIX 5 done: createNotesBatch. Now {len(kommo)} lines")

write(KOMMO, kommo)
print("kommoApi.js saved.\n")
print("=== All 5 fixes applied successfully! ===")
