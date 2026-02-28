#!/usr/bin/env node
// patch_tasks_notes_v2.js
// Fixes:
//   1. transformTask — remove is_completed (causes 400), add complete_till fallback
//   2. runSingleDealsTransfer — add company notes, split notes/tasks counters
//   3. App.jsx — show detailed notes/tasks stats in result panel

const fs = require('fs');

// ════════════════════════════════════════════════════════════════
// ПАТЧ 1: dataTransformer.js — убрать is_completed из transformTask
// ════════════════════════════════════════════════════════════════
{
  const path = '/var/www/amoschool/backend/src/utils/dataTransformer.js';
  let src = fs.readFileSync(path, 'utf8');
  const crlf = src.includes('\r\n');
  src = src.replace(/\r\n/g, '\n');

  const OLD = `function transformTask(amoTask, entityIdMap) {
  const obj = {
    task_type_id: amoTask.task_type_id || 1,
    text: amoTask.text || '',
    complete_till: amoTask.complete_till,
    is_completed: amoTask.is_completed || false,
  };`;

  const NEW = `function transformTask(amoTask, entityIdMap) {
  // complete_till must be a valid future/past unix timestamp > 0
  // is_completed is NOT accepted by Kommo POST /api/v4/tasks — causes 400
  const fallbackTill = Math.floor(Date.now() / 1000) + 86400; // tomorrow
  const obj = {
    task_type_id: amoTask.task_type_id || 1,
    text: amoTask.text || '',
    complete_till: (amoTask.complete_till && amoTask.complete_till > 0)
      ? amoTask.complete_till
      : fallbackTill,
  };`;

  if (src.includes(OLD)) {
    src = src.replace(OLD, NEW);
    console.log('OK 1: transformTask — убран is_completed, добавлен fallback complete_till');
  } else {
    console.log('FAIL 1: transformTask pattern not found');
  }

  fs.writeFileSync(path, crlf ? src.replace(/\n/g, '\r\n') : src, 'utf8');
}

// ════════════════════════════════════════════════════════════════
// ПАТЧ 2: batchMigrationService.js — company notes + детальные счётчики
// ════════════════════════════════════════════════════════════════
{
  const path = '/var/www/amoschool/backend/src/services/batchMigrationService.js';
  let src = fs.readFileSync(path, 'utf8');
  const crlf = src.includes('\r\n');
  src = src.replace(/\r\n/g, '\n');

  // 2а. Добавить notesDetail и tasksDetail в result объект
  const OLD2A = `  const result = {
    requested: leadIds.length,
    found: selectedLeads.length,
    transferred: { leads: 0, contacts: 0, companies: 0, tasks: 0, notes: 0 },
    skipped:     { leads: 0, contacts: 0, companies: 0 },
    errors:   [],
    warnings: [],
    createdIds: { contacts: [], companies: [], leads: [], tasks: [], notes: [] },
  };`;

  const NEW2A = `  const result = {
    requested: leadIds.length,
    found: selectedLeads.length,
    transferred: { leads: 0, contacts: 0, companies: 0, tasks: 0, notes: 0 },
    skipped:     { leads: 0, contacts: 0, companies: 0 },
    errors:   [],
    warnings: [],
    createdIds: { contacts: [], companies: [], leads: [], tasks: [], notes: [] },
    // Детальная статистика заметок и задач
    notesDetail: {
      leads:     { fetched: 0, transferred: 0 },
      contacts:  { fetched: 0, transferred: 0 },
      companies: { fetched: 0, transferred: 0 },
    },
    tasksDetail: { found: 0, created: 0 },
  };`;

  if (src.includes(OLD2A)) {
    src = src.replace(OLD2A, NEW2A);
    console.log('OK 2а: result — добавлены notesDetail и tasksDetail');
  } else {
    console.log('FAIL 2а');
  }

  // 2б. Добавить tasksDetail.found и tasksDetail.created в секцию задач
  const OLD2B = `    logger.info(\`[transfer] задач в кэше: \${dealTasks.length} (selectedLeads: \${selectedLeads.length}, leadIdMap keys: \${Object.keys(leadIdMap).length})\`);
    if (dealTasks.length > 0) {
      try {
        const { transformTask } = require('../utils/dataTransformer');
        const tasksToCreate = dealTasks
          .map(t => {
            const tt = transformTask(t);
            tt.entity_id   = Number(leadIdMap[String(t.entity_id)]);
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
        logger.info(\`[transfer] createTasksBatch вернул \${created.length} объектов\`);
        created.forEach(k => { if (k) { result.createdIds.tasks.push(k.id); result.transferred.tasks++; } });
      } catch (e) {
        result.warnings.push('Задачи: ' + e.message);
        logger.error('[transfer] ошибка задач:', e.message);
      }
    }`;

  const NEW2B = `    logger.info(\`[transfer] задач в кэше: \${dealTasks.length} (selectedLeads: \${selectedLeads.length}, leadIdMap keys: \${Object.keys(leadIdMap).length})\`);
    result.tasksDetail.found = dealTasks.length;
    if (dealTasks.length > 0) {
      try {
        const { transformTask } = require('../utils/dataTransformer');
        const tasksToCreate = dealTasks
          .map(t => {
            const tt = transformTask(t);
            tt.entity_id   = Number(leadIdMap[String(t.entity_id)]);
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
        logger.info(\`[transfer] createTasksBatch вернул \${created.length} объектов\`);
        created.forEach(k => { if (k) { result.createdIds.tasks.push(k.id); result.transferred.tasks++; result.tasksDetail.created++; } });
      } catch (e) {
        result.warnings.push('Задачи: ' + e.message);
        logger.error('[transfer] ошибка задач:', e.message);
      }
    }`;

  if (src.includes(OLD2B)) {
    src = src.replace(OLD2B, NEW2B);
    console.log('OK 2б: tasksDetail.found/created');
  } else {
    console.log('FAIL 2б');
  }

  // 2в. Добавить notesDetail.leads в секцию заметок сделок
  const OLD2V = `      try {
        const notes = await amoApi.getLeadNotes(aLead.id);
        logger.info(\`[transfer] AMO lead #\${aLead.id}: \${notes.length} заметок\`);
        if (notes.length > 0) {
          const notesData = notes.map(n => ({
            entity_id:  Number(kId),
            note_type:  n.note_type || 'common',
            params:     n.params    || {},
          }));
          const created = await kommoApi.createNotesBatch('leads', notesData);
          logger.info(\`[transfer] createNotesBatch(leads) вернул \${created.length} объектов\`);
          created.forEach(n => { if (n) { result.createdIds.notes.push(n.id); result.transferred.notes++; } });
        }
      } catch (e) {
        result.warnings.push('Заметки сделки AMO#' + aLead.id + ': ' + e.message);
        logger.error('[transfer] ошибка заметок AMO#' + aLead.id + ':', e.message);
      }`;

  const NEW2V = `      try {
        const notes = await amoApi.getLeadNotes(aLead.id);
        logger.info(\`[transfer] AMO lead #\${aLead.id}: \${notes.length} заметок\`);
        result.notesDetail.leads.fetched += notes.length;
        if (notes.length > 0) {
          const notesData = notes.map(n => ({
            entity_id:  Number(kId),
            note_type:  n.note_type || 'common',
            params:     n.params    || {},
          }));
          const created = await kommoApi.createNotesBatch('leads', notesData);
          logger.info(\`[transfer] createNotesBatch(leads) вернул \${created.length} объектов\`);
          created.forEach(n => { if (n) { result.createdIds.notes.push(n.id); result.transferred.notes++; result.notesDetail.leads.transferred++; } });
        }
      } catch (e) {
        result.warnings.push('Заметки сделки AMO#' + aLead.id + ': ' + e.message);
        logger.error('[transfer] ошибка заметок AMO#' + aLead.id + ':', e.message);
      }`;

  if (src.includes(OLD2V)) {
    src = src.replace(OLD2V, NEW2V);
    console.log('OK 2в: notesDetail.leads');
  } else {
    console.log('FAIL 2в: lead notes counter');
  }

  // 2г. Исправить баг в contact notes (нет entity_id и note_type в payload!) + notesDetail.contacts
  const OLD2G = `      try {
        const notes = await amoApi.getContactNotes(aContactId);
        if (notes.length > 0) {
          const notesData = notes.map(n => ({
            params:     n.params    || {},
          }));
          const created = await kommoApi.createNotesBatch('contacts', notesData);
          created.forEach(n => { if (n) { result.createdIds.notes.push(n.id); result.transferred.notes++; } });
        }
      } catch (e) { result.warnings.push('Заметки контакта AMO#' + aContactId + ': ' + e.message); }`;

  const NEW2G = `      try {
        const notes = await amoApi.getContactNotes(aContactId);
        result.notesDetail.contacts.fetched += notes.length;
        if (notes.length > 0) {
          const notesData = notes.map(n => ({
            entity_id:  Number(kContactId),
            note_type:  n.note_type || 'common',
            params:     n.params    || {},
          }));
          const created = await kommoApi.createNotesBatch('contacts', notesData);
          created.forEach(n => { if (n) { result.createdIds.notes.push(n.id); result.transferred.notes++; result.notesDetail.contacts.transferred++; } });
        }
      } catch (e) { result.warnings.push('Заметки контакта AMO#' + aContactId + ': ' + e.message); }`;

  if (src.includes(OLD2G)) {
    src = src.replace(OLD2G, NEW2G);
    console.log('OK 2г: исправлен баг contact notes (нет entity_id/note_type) + notesDetail.contacts');
  } else {
    console.log('FAIL 2г: contact notes');
  }

  // 2д. Добавить company notes ПОСЛЕ contact notes блока
  const OLD2D = `  logger.info(
    '[single transfer] done: leads=' + result.transferred.leads +
    ' contacts=' + result.transferred.contacts +
    ' companies=' + result.transferred.companies +
    ' tasks=' + result.transferred.tasks +
    ' notes=' + result.transferred.notes
  );
  return result;`;

  const NEW2D = `  // ── Notes: company notes (live fetch from AMO) ─────────────────────────────────
  const transferredCompanyIds = new Set();
  for (const aLead of selectedLeads) {
    for (const c of ((aLead._embedded && aLead._embedded.companies) || [])) {
      const aCompanyId = c.id;
      const kCompanyId = companyIdMap[String(aCompanyId)];
      if (!kCompanyId || transferredCompanyIds.has(aCompanyId)) continue;
      transferredCompanyIds.add(aCompanyId);
      try {
        const { notes } = await amoApi.getNotes('companies', aCompanyId);
        result.notesDetail.companies.fetched += notes.length;
        if (notes.length > 0) {
          const notesData = notes.map(n => ({
            entity_id:  Number(kCompanyId),
            note_type:  n.note_type || 'common',
            params:     n.params    || {},
          }));
          const created = await kommoApi.createNotesBatch('companies', notesData);
          created.forEach(n => { if (n) { result.createdIds.notes.push(n.id); result.transferred.notes++; result.notesDetail.companies.transferred++; } });
        }
      } catch (e) { result.warnings.push('Заметки компании AMO#' + aCompanyId + ': ' + e.message); }
    }
  }

  logger.info(
    '[single transfer] done: leads=' + result.transferred.leads +
    ' contacts=' + result.transferred.contacts +
    ' companies=' + result.transferred.companies +
    ' tasks=' + result.transferred.tasks +
    ' notes=' + result.transferred.notes +
    ' (leads:' + result.notesDetail.leads.transferred +
    '/contacts:' + result.notesDetail.contacts.transferred +
    '/companies:' + result.notesDetail.companies.transferred + ')'
  );
  return result;`;

  if (src.includes(OLD2D)) {
    src = src.replace(OLD2D, NEW2D);
    console.log('OK 2д: добавлены company notes + улучшен финальный лог');
  } else {
    console.log('FAIL 2д: company notes block');
  }

  fs.writeFileSync(path, crlf ? src.replace(/\n/g, '\r\n') : src, 'utf8');
}

// ════════════════════════════════════════════════════════════════
// ПАТЧ 3: App.jsx — детальное отображение заметок и задач
// ════════════════════════════════════════════════════════════════
{
  const path = '/var/www/amoschool/frontend/src/App.jsx';
  let src = fs.readFileSync(path, 'utf8');
  const crlf = src.includes('\r\n');
  src = src.replace(/\r\n/g, '\n');

  const OLD3 = `                        <div>Задач: {singleTransferResult.transferred?.tasks}</div>
                        <div>Заметок (сделки + контакты): {singleTransferResult.transferred?.notes}</div>`;

  const NEW3 = `                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span>Задач:</span>
                          <strong>{singleTransferResult.transferred?.tasks}</strong>
                          {singleTransferResult.tasksDetail && (
                            <span style={{ fontSize: 12, color: '#6b7280' }}>
                              (найдено в кэше: {singleTransferResult.tasksDetail.found}, создано: {singleTransferResult.tasksDetail.created})
                            </span>
                          )}
                        </div>
                        <div style={{ marginTop: 4 }}>
                          <div><strong>Заметки:</strong> {singleTransferResult.transferred?.notes} перенесено</div>
                          {singleTransferResult.notesDetail ? (
                            <div style={{ marginLeft: 12, fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
                              <div>🔹 Сделки: скачано {singleTransferResult.notesDetail.leads?.fetched ?? '—'}, перенесено <strong>{singleTransferResult.notesDetail.leads?.transferred ?? '—'}</strong></div>
                              <div>🔹 Контакты: скачано {singleTransferResult.notesDetail.contacts?.fetched ?? '—'}, перенесено <strong>{singleTransferResult.notesDetail.contacts?.transferred ?? '—'}</strong></div>
                              <div>🔹 Компании: скачано {singleTransferResult.notesDetail.companies?.fetched ?? '—'}, перенесено <strong>{singleTransferResult.notesDetail.companies?.transferred ?? '—'}</strong></div>
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, color: '#6b7280' }}>(Заметки сделки + контакты)</div>
                          )}
                        </div>`;

  if (src.includes(OLD3)) {
    src = src.replace(OLD3, NEW3);
    console.log('OK 3: App.jsx — детальный вывод заметок и задач');
  } else {
    console.log('FAIL 3: App.jsx result block not found');
  }

  fs.writeFileSync(path, crlf ? src.replace(/\n/g, '\r\n') : src, 'utf8');
}

console.log('\nВсе патчи завершены.');
