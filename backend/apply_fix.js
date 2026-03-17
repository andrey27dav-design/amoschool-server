// Script to apply fixes to batchMigrationService.js and kommoApi.js
const fs = require('fs');

// ───────────────────────────────────────────────────────────────────────────
// FIX 1: batchMigrationService.js — embed contacts/companies in lead creation
// FIX 2: batchMigrationService.js — add type safety + logging for tasks/notes
// FIX 3: kommoApi.js — add logging in createTasksBatch/createNotesBatch
// ───────────────────────────────────────────────────────────────────────────

const batchPath = '/var/www/amoschool/backend/src/services/batchMigrationService.js';
const kommoPath = '/var/www/amoschool/backend/src/services/kommoApi.js';

// ─── batch service ────────────────────────────────────────────────────────

let batch = fs.readFileSync(batchPath, 'utf8');

// FIX 1: leads creation — embed contacts/companies in payload
const OLD_LEADS_CREATE = `    if (leadsToCreate.length > 0) {
      try {
        const { transformLead } = require('../utils/dataTransformer');
        const leadsForKommo = leadsToCreate.map(lead => {
          const t = transformLead(lead, stageMapping || {}, fieldMappings.leads);
          t.pipeline_id = config.kommo.pipelineId;
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
          // Link contacts
          for (const c of ((a._embedded && a._embedded.contacts) || [])) {
            const kId = contactIdMap[String(c.id)];
            if (kId) {
              try { await kommoApi.linkContactToLead(k.id, kId); }
              catch (e) { result.warnings.push('Привязка контакта #' + c.id + ': ' + e.message); }
            }
          }
          // Link companies
          for (const c of ((a._embedded && a._embedded.companies) || [])) {
            const kId = companyIdMap[String(c.id)];
            if (kId) {
              try { await kommoApi.linkCompanyToLead(k.id, kId); }
              catch (e) { result.warnings.push('Привязка компании #' + c.id + ': ' + e.message); }
            }
          }
        }
        safety.registerMigratedBatch('leads', pairs);
      } catch (e) { result.errors.push('Сделки: ' + e.message); }
    }`;

const NEW_LEADS_CREATE = `    if (leadsToCreate.length > 0) {
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
              logger.warn(\`Lead AMO#\${lead.id}: контакт AMO#\${c.id} не найден в contactIdMap — привязка пропущена\`);
            }
          }
          for (const c of ((lead._embedded && lead._embedded.companies) || [])) {
            const kId = companyIdMap[String(c.id)];
            if (kId) {
              embCompanies.push({ id: kId });
            } else {
              logger.warn(\`Lead AMO#\${lead.id}: компания AMO#\${c.id} не найдена в companyIdMap — привязка пропущена\`);
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
          logger.info(\`[transfer] Lead AMO#\${a.id} → Kommo#\${k.id}: контактов=\${(a._embedded?.contacts||[]).length}, компаний=\${(a._embedded?.companies||[]).length}\`);
        }
        safety.registerMigratedBatch('leads', pairs);
      } catch (e) { result.errors.push('Сделки: ' + e.message); }
    }`;

if (!batch.includes(OLD_LEADS_CREATE.trim().substring(0, 60))) {
  // try normalized whitespace match
  console.error('ERROR: OLD_LEADS_CREATE not found in file');
  process.exit(1);
}
batch = batch.replace(OLD_LEADS_CREATE, NEW_LEADS_CREATE);
console.log('FIX 1 applied: lead creation with _embedded contacts/companies');

// FIX 2: tasks — type safety + logging
const OLD_TASKS = `    // ── Tasks (from cache) ─────────────────────────────────────────────────────
    const selectedIds = new Set(selectedLeads.map(l => l.id));
    const dealTasks = allTasks.filter(
      t => t.entity_type === 'leads' && selectedIds.has(t.entity_id)
    );
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
          result.warnings.push(
            (dealTasks.length - tasksToCreate.length) + ' задач потеряли привязку (сделка не создана в этом переносе).'
          );
        }
        const created = await kommoApi.createTasksBatch(tasksToCreate);
        created.forEach(k => { if (k) { result.createdIds.tasks.push(k.id); result.transferred.tasks++; } });
      } catch (e) { result.warnings.push('Задачи: ' + e.message); }
    }`;

const NEW_TASKS = `    // ── Tasks (from cache) ─────────────────────────────────────────────────────
    // Number() cast — защита от несоответствия типов string/number в Set
    const selectedIds = new Set(selectedLeads.map(l => Number(l.id)));
    const dealTasks = allTasks.filter(
      t => t.entity_type === 'leads' && selectedIds.has(Number(t.entity_id))
    );
    logger.info(\`[transfer] найдено задач: \${dealTasks.length} для \${selectedIds.size} сделок (idMap имеет \${Object.keys(leadIdMap).length} записей)\`);
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
          logger.warn(\`[transfer] \${lost} задач без entity_id в leadIdMap\`);
        }
        logger.info(\`[transfer] создаём \${tasksToCreate.length} задач в Kommo\`);
        const created = await kommoApi.createTasksBatch(tasksToCreate);
        logger.info(\`[transfer] createTasksBatch: получено \${created.length} объектов\`);
        created.forEach(k => { if (k) { result.createdIds.tasks.push(k.id); result.transferred.tasks++; } });
      } catch (e) {
        result.warnings.push('Задачи: ' + e.message);
        logger.error('[transfer] ошибка задач:', e.message);
      }
    }`;

if (!batch.includes(OLD_TASKS.trim().substring(0, 60))) {
  console.error('ERROR: OLD_TASKS not found in file');
  process.exit(1);
}
batch = batch.replace(OLD_TASKS, NEW_TASKS);
console.log('FIX 2 applied: tasks type safety + logging');

// FIX 3: notes lead section — add logging
const OLD_NOTES = `    // ── Notes: lead notes (live fetch from AMO) ──────────────────────────────────────────────────
    for (const aLead of selectedLeads) {
      const kId = leadIdMap[String(aLead.id)];
      if (!kId) continue;
      try {
        const notes = await amoApi.getLeadNotes(aLead.id);
        if (notes.length > 0) {
          const notesData = notes.map(n => ({
            entity_id:  kId,
            note_type:  n.note_type || 'common',
            params:     n.params    || {},
          }));
          const created = await kommoApi.createNotesBatch('leads', notesData);
          created.forEach(n => { if (n) { result.createdIds.notes.push(n.id); result.transferred.notes++; } });
        }
      } catch (e) { result.warnings.push('Заметки сделки AMO#' + aLead.id + ': ' + e.message); }
    }`;

const NEW_NOTES = `    // ── Notes: lead notes (live fetch from AMO) ──────────────────────────────────────────────────
    for (const aLead of selectedLeads) {
      const kId = leadIdMap[String(aLead.id)];
      if (!kId) { logger.warn(\`[transfer] notes: нет kommo id для AMO lead #\${aLead.id}\`); continue; }
      try {
        const notes = await amoApi.getLeadNotes(aLead.id);
        logger.info(\`[transfer] AMO lead #\${aLead.id}: получено \${notes.length} заметок\`);
        if (notes.length > 0) {
          const notesData = notes.map(n => ({
            entity_id:  kId,
            note_type:  n.note_type || 'common',
            params:     n.params    || {},
          }));
          const created = await kommoApi.createNotesBatch('leads', notesData);
          logger.info(\`[transfer] createNotesBatch(leads): получено \${created.length} объектов\`);
          created.forEach(n => { if (n) { result.createdIds.notes.push(n.id); result.transferred.notes++; } });
        }
      } catch (e) {
        result.warnings.push('Заметки сделки AMO#' + aLead.id + ': ' + e.message);
        logger.error('[transfer] ошибка заметок AMO#' + aLead.id + ':', e.message);
      }
    }`;

if (!batch.includes(OLD_NOTES.trim().substring(0, 60))) {
  console.error('ERROR: OLD_NOTES not found in file');
  process.exit(1);
}
batch = batch.replace(OLD_NOTES, NEW_NOTES);
console.log('FIX 3 applied: notes logging');

fs.writeFileSync(batchPath, batch, 'utf8');
console.log('batchMigrationService.js saved.');

// ─── kommoApi.js — add logging to createTasksBatch / createNotesBatch ────

let kommo = fs.readFileSync(kommoPath, 'utf8');

const OLD_TASKS_BATCH = `async function createTasksBatch(tasks) {
  const chunks = [];
  for (let i = 0; i < tasks.length; i += 50) chunks.push(tasks.slice(i, i + 50));
  const created = [];
  for (const chunk of chunks) {
    await rateLimit();
    const res = await kommoClient.post('/api/v4/tasks', chunk);
    created.push(...(res.data._embedded?.tasks || []));
    logger.info(\`Kommo: created \${created.length} tasks so far\`);
  }
  return created;
}`;

const NEW_TASKS_BATCH = `async function createTasksBatch(tasks) {
  const chunks = [];
  for (let i = 0; i < tasks.length; i += 50) chunks.push(tasks.slice(i, i + 50));
  const created = [];
  for (const chunk of chunks) {
    await rateLimit();
    const res = await kommoClient.post('/api/v4/tasks', chunk);
    const embedded = res.data._embedded?.tasks || [];
    logger.info(\`Kommo createTasksBatch: status=\${res.status}, _embedded.tasks=\${embedded.length}, all keys=\${Object.keys(res.data||{}).join(',')}\`);
    created.push(...embedded);
  }
  logger.info(\`Kommo createTasksBatch: returning \${created.length} total\`);
  return created;
}`;

if (!kommo.includes(OLD_TASKS_BATCH.trim().substring(0, 50))) {
  console.error('ERROR: OLD_TASKS_BATCH not found in kommoApi.js');
  process.exit(1);
}
kommo = kommo.replace(OLD_TASKS_BATCH, NEW_TASKS_BATCH);
console.log('FIX 4 applied: createTasksBatch logging');

const OLD_NOTES_BATCH = `async function createNotesBatch(entityType, notes) {
  const chunks = [];
  for (let i = 0; i < notes.length; i += 50) chunks.push(notes.slice(i, i + 50));
  const created = [];
  for (const chunk of chunks) {
    await rateLimit();
    const res = await kommoClient.post(\`/api/v4/\${entityType}/notes\`, chunk);
    created.push(...(res.data._embedded?.notes || []));
  }
  return created;
}`;

const NEW_NOTES_BATCH = `async function createNotesBatch(entityType, notes) {
  const chunks = [];
  for (let i = 0; i < notes.length; i += 50) chunks.push(notes.slice(i, i + 50));
  const created = [];
  for (const chunk of chunks) {
    await rateLimit();
    const res = await kommoClient.post(\`/api/v4/\${entityType}/notes\`, chunk);
    const embedded = res.data._embedded?.notes || [];
    logger.info(\`Kommo createNotesBatch(\${entityType}): status=\${res.status}, _embedded.notes=\${embedded.length}, keys=\${Object.keys(res.data||{}).join(',')}\`);
    created.push(...embedded);
  }
  logger.info(\`Kommo createNotesBatch(\${entityType}): returning \${created.length} total\`);
  return created;
}`;

if (!kommo.includes(OLD_NOTES_BATCH.trim().substring(0, 50))) {
  console.error('ERROR: OLD_NOTES_BATCH not found in kommoApi.js');
  process.exit(1);
}
kommo = kommo.replace(OLD_NOTES_BATCH, NEW_NOTES_BATCH);
console.log('FIX 5 applied: createNotesBatch logging');

fs.writeFileSync(kommoPath, kommo, 'utf8');
console.log('kommoApi.js saved.');

console.log('\nAll fixes applied successfully!');
