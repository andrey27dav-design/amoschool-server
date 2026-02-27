#!/usr/bin/env python3
"""Apply migration fixes using line-number ranges."""
import sys

BATCH = '/var/www/amoschool/backend/src/services/batchMigrationService.js'
KOMMO = '/var/www/amoschool/backend/src/services/kommoApi.js'

def read(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.readlines()   # list, 0-indexed, each line has \n

def write(path, lines):
    with open(path, 'w', encoding='utf-8') as f:
        f.writelines(lines)

def replace_lines(lines, start_1based, end_1based, new_text):
    """Replace lines[start_1based-1 : end_1based] with new_text lines."""
    new_lines = [l if l.endswith('\n') else l+'\n' for l in new_text.split('\n')]
    # Remove trailing empty line from split if last char was \n
    if new_lines and new_lines[-1] == '\n':
        new_lines = new_lines[:-1]
    return lines[:start_1based-1] + new_lines + lines[end_1based:]

# ═══════════════════════════════════════════════════════════════════════
# 1. batchMigrationService.js
# ═══════════════════════════════════════════════════════════════════════
batch = read(BATCH)
print(f"batchMigrationService.js: {len(batch)} lines")

# --- Verify key lines ---
print("Line 670:", batch[669].rstrip())   # should be: "    if (leadsToCreate.length > 0) {"
print("Line 673:", batch[672].rstrip())   # should be: "        const leadsForKommo = leadsToCreate.map(lead => {"
print("Line 706:", batch[705].rstrip())   # should be: "    }"
print("Line 708:", batch[707].rstrip())   # should be: "    // ── Tasks"
print("Line 709:", batch[708].rstrip())   # should be: "    const selectedIds"
print("Line 732:", batch[731].rstrip())   # should be: "    }"
print("Line 734:", batch[733].rstrip())   # should be: "    // ── Notes: lead notes"
print("Line 750:", batch[749].rstrip())   # should be: "    }"
print()

# ─── FIX 1: leads creation — lines 670-706 ────────────────────────────
NEW_LEADS = """    if (leadsToCreate.length > 0) {
      try {
        const { transformLead } = require('../utils/dataTransformer');
        const leadsForKommo = leadsToCreate.map(lead => {
          const t = transformLead(lead, stageMapping || {}, fieldMappings.leads);
          t.pipeline_id = config.kommo.pipelineId;
          // ── Встраиваем контакты и компании в _embedded при создании сделки ──
          // (Kommo API: единственный надёжный способ привязать контакт к сделке —
          //  передать его id в _embedded.contacts при POST /api/v4/leads)
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
          logger.info(`[transfer] Lead AMO#${a.id} → Kommo#${k.id}: контактов=${(a._embedded?.contacts||[]).length}, компаний=${(a._embedded?.companies||[]).length}`);
        }
        safety.registerMigratedBatch('leads', pairs);
      } catch (e) { result.errors.push('Сделки: ' + e.message); }
    }"""

batch = replace_lines(batch, 670, 706, NEW_LEADS)
print(f"FIX 1 done: batchMigrationService lines 670-706 replaced ({len(batch)} lines now)")

# ─── FIX 2: tasks section — lines 708-732 ─────────────────────────────
# After fix 1 removed 37 lines and added 49 lines = net +12 lines
# Lines shifted by +12: "708" became "720", "732" became "744"
# But let me find the actual new positions by searching
lines_arr = [l.rstrip() for l in batch]
tasks_start = None
notes_start = None
for i, l in enumerate(lines_arr):
    if '// ── Tasks (from cache)' in l:
        tasks_start = i + 1  # 1-based
    if '// ── Notes: lead notes (live fetch from AMO)' in l and notes_start is None:
        notes_start = i + 1  # 1-based

print(f"Tasks section found at line {tasks_start}")
print(f"Notes section found at line {notes_start}")

# Find end of tasks section (the closing } before the notes comment)
tasks_end = None
for i in range(tasks_start, notes_start):
    if lines_arr[i-1].rstrip() == '    }':
        tasks_end = i

print(f"Tasks section ends at line {tasks_end}")

NEW_TASKS = """    // ── Tasks (from cache) ─────────────────────────────────────────────────────
    // Number() cast — защита от несоответствия типов string/number в Set
    const selectedIds = new Set(selectedLeads.map(l => Number(l.id)));
    const dealTasks = allTasks.filter(
      t => t.entity_type === 'leads' && selectedIds.has(Number(t.entity_id))
    );
    logger.info(`[transfer] найдено задач: ${dealTasks.length} для ${selectedIds.size} сделок (leadIdMap: ${Object.keys(leadIdMap).length} записей)`);
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
        logger.info(`[transfer] createTasksBatch: вернул ${created.length} объектов`);
        created.forEach(k => { if (k) { result.createdIds.tasks.push(k.id); result.transferred.tasks++; } });
      } catch (e) {
        result.warnings.push('Задачи: ' + e.message);
        logger.error('[transfer] ошибка задач:', e.message);
      }
    }"""

batch = replace_lines(batch, tasks_start, tasks_end, NEW_TASKS)
print(f"FIX 2 done: tasks section replaced ({len(batch)} lines now)")

# ─── FIX 3: notes lead section ────────────────────────────────────────
lines_arr = [l.rstrip() for l in batch]
notes_start = None
notes_end = None
for i, l in enumerate(lines_arr):
    if '// ── Notes: lead notes (live fetch from AMO)' in l and notes_start is None:
        notes_start = i + 1
# Find end of this notes section (before contact notes section)
contact_notes_start = None
for i, l in enumerate(lines_arr):
    if '// ── Notes: contact notes' in l:
        contact_notes_start = i + 1
        break

# Find the blank line / last closing brace just before contact notes section
for i in range(notes_start, contact_notes_start):
    if lines_arr[i-1].rstrip() == '    }':
        notes_end = i

print(f"Notes (lead) section: lines {notes_start}-{notes_end}")

NEW_NOTES = """    // ── Notes: lead notes (live fetch from AMO) ──────────────────────────────────────────────────
    for (const aLead of selectedLeads) {
      const kId = leadIdMap[String(aLead.id)];
      if (!kId) { logger.warn(`[transfer] notes: нет kommo id для AMO lead #${aLead.id}`); continue; }
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
          logger.info(`[transfer] createNotesBatch(leads) → ${created.length} объектов`);
          created.forEach(n => { if (n) { result.createdIds.notes.push(n.id); result.transferred.notes++; } });
        }
      } catch (e) {
        result.warnings.push('Заметки сделки AMO#' + aLead.id + ': ' + e.message);
        logger.error('[transfer] ошибка заметок AMO#' + aLead.id + ':', e.message);
      }
    }"""

batch = replace_lines(batch, notes_start, notes_end, NEW_NOTES)
print(f"FIX 3 done: notes section replaced ({len(batch)} lines now)")

write(BATCH, batch)
print("batchMigrationService.js saved OK")

# ═══════════════════════════════════════════════════════════════════════
# 2. kommoApi.js  
# ═══════════════════════════════════════════════════════════════════════
kommo = read(KOMMO)
print(f"\nkommoApi.js: {len(kommo)} lines")

lines_arr = [l.rstrip() for l in kommo]
tasks_fn_start = None
notes_fn_start = None
for i, l in enumerate(lines_arr):
    if l.strip() == 'async function createTasksBatch(tasks) {':
        tasks_fn_start = i + 1
    if l.strip() == 'async function createNotesBatch(entityType, notes) {':
        notes_fn_start = i + 1

print(f"createTasksBatch at line {tasks_fn_start}, createNotesBatch at line {notes_fn_start}")

# Find end of each function (the closing })
def find_fn_end(lines_arr, start_1based):
    depth = 0
    for i in range(start_1based - 1, len(lines_arr)):
        for ch in lines_arr[i]:
            if ch == '{': depth += 1
            elif ch == '}': depth -= 1
        if depth == 0 and i >= start_1based - 1:
            return i + 1  # 1-based
    return None

tasks_fn_end = find_fn_end(lines_arr, tasks_fn_start)
notes_fn_end = find_fn_end(lines_arr, notes_fn_start)
print(f"createTasksBatch ends at line {tasks_fn_end}")
print(f"createNotesBatch ends at line {notes_fn_end}")
print("createTasksBatch body:", '\n'.join(l.rstrip() for l in kommo[tasks_fn_start-1:tasks_fn_end]))

NEW_TASKS_BATCH = """async function createTasksBatch(tasks) {
  const chunks = [];
  for (let i = 0; i < tasks.length; i += 50) chunks.push(tasks.slice(i, i + 50));
  const created = [];
  for (const chunk of chunks) {
    await rateLimit();
    const res = await kommoClient.post('/api/v4/tasks', chunk);
    const embedded = res.data._embedded?.tasks || [];
    logger.info(`Kommo createTasksBatch: status=${res.status}, tasks=${embedded.length}, data_keys=${Object.keys(res.data||{}).join(',')}`);
    created.push(...embedded);
  }
  logger.info(`Kommo createTasksBatch: returning ${created.length} total`);
  return created;
}"""

kommo = replace_lines(kommo, tasks_fn_start, tasks_fn_end, NEW_TASKS_BATCH)
print(f"FIX 4 done: createTasksBatch logging ({len(kommo)} lines now)")

# Recalculate notes fn position after replacement
lines_arr = [l.rstrip() for l in kommo]
notes_fn_start = None
for i, l in enumerate(lines_arr):
    if l.strip() == 'async function createNotesBatch(entityType, notes) {':
        notes_fn_start = i + 1

notes_fn_end = find_fn_end(lines_arr, notes_fn_start)
print(f"createNotesBatch at line {notes_fn_start}, ends at line {notes_fn_end}")

NEW_NOTES_BATCH = """async function createNotesBatch(entityType, notes) {
  const chunks = [];
  for (let i = 0; i < notes.length; i += 50) chunks.push(notes.slice(i, i + 50));
  const created = [];
  for (const chunk of chunks) {
    await rateLimit();
    const res = await kommoClient.post(`/api/v4/${entityType}/notes`, chunk);
    const embedded = res.data._embedded?.notes || [];
    logger.info(`Kommo createNotesBatch(${entityType}): status=${res.status}, notes=${embedded.length}`);
    created.push(...embedded);
  }
  logger.info(`Kommo createNotesBatch(${entityType}): returning ${created.length} total`);
  return created;
}"""

kommo = replace_lines(kommo, notes_fn_start, notes_fn_end, NEW_NOTES_BATCH)
print(f"FIX 5 done: createNotesBatch logging ({len(kommo)} lines now)")

write(KOMMO, kommo)
print("kommoApi.js saved OK")

print("\n=== All fixes applied successfully! ===")
