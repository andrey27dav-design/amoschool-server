#!/usr/bin/env node
// patch_tasks_detail.js
// 1. tasksDetail → разбивка leads/contacts (found/created)
// 2. Добавить перенос задач контактов
// 3. App.jsx — детальный вывод задач по сущностям

const fs = require('fs');

// ════════════════════════════════════════════════════════════════
// ПАТЧ 1: batchMigrationService.js
// ════════════════════════════════════════════════════════════════
{
  const path = '/var/www/amoschool/backend/src/services/batchMigrationService.js';
  let src = fs.readFileSync(path, 'utf8');
  const crlf = src.includes('\r\n');
  src = src.replace(/\r\n/g, '\n');

  // 1а. Изменить tasksDetail: flat → leads/contacts
  const OLD1A = `    tasksDetail: { found: 0, created: 0 },`;
  const NEW1A = `    tasksDetail: {
      leads:    { found: 0, created: 0 },
      contacts: { found: 0, created: 0 },
    },`;
  if (src.includes(OLD1A)) {
    src = src.replace(OLD1A, NEW1A);
    console.log('OK 1а: tasksDetail разбит на leads/contacts');
  } else { console.log('FAIL 1а'); }

  // 1б. Обновить счётчики в секции задач сделок
  const OLD1B = `    result.tasksDetail.found = dealTasks.length;
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

  const NEW1B = `    result.tasksDetail.leads.found = dealTasks.length;
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
          result.warnings.push(lost + ' задач сделок потеряли привязку (сделка не создана в этом переносе).');
          logger.warn(\`[transfer] \${lost} задач без entity_id в leadIdMap\`);
        }
        logger.info(\`[transfer] создаём \${tasksToCreate.length} задач сделок в Kommo\`);
        const created = await kommoApi.createTasksBatch(tasksToCreate);
        logger.info(\`[transfer] createTasksBatch(leads) вернул \${created.length} объектов\`);
        created.forEach(k => { if (k) { result.createdIds.tasks.push(k.id); result.transferred.tasks++; result.tasksDetail.leads.created++; } });
      } catch (e) {
        result.warnings.push('Задачи сделок: ' + e.message);
        logger.error('[transfer] ошибка задач сделок:', e.message);
      }
    }

    // ── Tasks: contact tasks (from cache) ────────────────────────────────────
    const neededContactIdsForTasks = new Set(
      selectedLeads.flatMap(l => ((l._embedded && l._embedded.contacts) || []).map(c => Number(c.id)))
    );
    const contactTasks = allTasks.filter(
      t => t.entity_type === 'contacts' && neededContactIdsForTasks.has(Number(t.entity_id))
    );
    logger.info(\`[transfer] задач контактов в кэше: \${contactTasks.length}\`);
    result.tasksDetail.contacts.found = contactTasks.length;
    if (contactTasks.length > 0) {
      try {
        const { transformTask } = require('../utils/dataTransformer');
        const tasksToCreate = contactTasks
          .map(t => {
            const kContactId = contactIdMap[String(t.entity_id)];
            if (!kContactId) return null;
            const tt = transformTask(t);
            tt.entity_id   = Number(kContactId);
            tt.entity_type = 'contacts';
            return tt;
          })
          .filter(Boolean);
        if (tasksToCreate.length < contactTasks.length) {
          const lost = contactTasks.length - tasksToCreate.length;
          result.warnings.push(lost + ' задач контактов потеряли привязку (контакт не найден в contactIdMap).');
        }
        if (tasksToCreate.length > 0) {
          logger.info(\`[transfer] создаём \${tasksToCreate.length} задач контактов в Kommo\`);
          const created = await kommoApi.createTasksBatch(tasksToCreate);
          logger.info(\`[transfer] createTasksBatch(contacts) вернул \${created.length} объектов\`);
          created.forEach(k => { if (k) { result.createdIds.tasks.push(k.id); result.transferred.tasks++; result.tasksDetail.contacts.created++; } });
        }
      } catch (e) {
        result.warnings.push('Задачи контактов: ' + e.message);
        logger.error('[transfer] ошибка задач контактов:', e.message);
      }
    }`;

  if (src.includes(OLD1B)) {
    src = src.replace(OLD1B, NEW1B);
    console.log('OK 1б: задачи сделок обновлены + добавлены задачи контактов');
  } else { console.log('FAIL 1б'); }

  fs.writeFileSync(path, crlf ? src.replace(/\n/g, '\r\n') : src, 'utf8');
}

// ════════════════════════════════════════════════════════════════
// ПАТЧ 2: App.jsx — детальный вывод задач
// ════════════════════════════════════════════════════════════════
{
  const path = '/var/www/amoschool/frontend/src/App.jsx';
  let src = fs.readFileSync(path, 'utf8');
  const crlf = src.includes('\r\n');
  src = src.replace(/\r\n/g, '\n');

  const OLD2 = `                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span>Задач:</span>
                          <strong>{singleTransferResult.transferred?.tasks}</strong>
                          {singleTransferResult.tasksDetail && (
                            <span style={{ fontSize: 12, color: '#6b7280' }}>
                              (найдено в кэше: {singleTransferResult.tasksDetail.found}, создано: {singleTransferResult.tasksDetail.created})
                            </span>
                          )}
                        </div>`;

  const NEW2 = `                        <div>
                          <div style={{ marginBottom: 2 }}><strong>Задачи:</strong> {singleTransferResult.transferred?.tasks} перенесено</div>
                          {singleTransferResult.tasksDetail ? (
                            <div style={{ marginLeft: 12, fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
                              <div>🔹 Сделки: найдено {singleTransferResult.tasksDetail.leads?.found ?? '—'}, перенесено <strong>{singleTransferResult.tasksDetail.leads?.created ?? '—'}</strong></div>
                              <div>🔹 Контакты: найдено {singleTransferResult.tasksDetail.contacts?.found ?? '—'}, перенесено <strong>{singleTransferResult.tasksDetail.contacts?.created ?? '—'}</strong></div>
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, color: '#6b7280' }}>(задачи сделок из кэша)</div>
                          )}
                        </div>`;

  if (src.includes(OLD2)) {
    src = src.replace(OLD2, NEW2);
    console.log('OK 2: App.jsx — детальный вывод задач');
  } else { console.log('FAIL 2: App.jsx tasks block not found'); }

  fs.writeFileSync(path, crlf ? src.replace(/\n/g, '\r\n') : src, 'utf8');
}

console.log('\nВсе патчи завершены.');
