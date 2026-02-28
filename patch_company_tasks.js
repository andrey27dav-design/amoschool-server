#!/usr/bin/env node
// patch_company_tasks.js
// 1. amoApi.js       — добавить getCompanyTasksByEntityIds
// 2. data.js         — качать задачи компаний в кэш
// 3. batchMigrationService.js — читать кэш + переносить задачи компаний + tasksDetail.companies
// 4. App.jsx         — строка "Компании" в детальных задачах

const fs = require('fs');

// ════════════════════════════════════════════════════════════════
// 1. amoApi.js — getCompanyTasksByEntityIds
// ════════════════════════════════════════════════════════════════
{
  const path = '/var/www/amoschool/backend/src/services/amoApi.js';
  let src = fs.readFileSync(path, 'utf8');
  const crlf = src.includes('\r\n'); src = src.replace(/\r\n/g, '\n');

  const OLD = `// Fetch contact tasks only for specific entity IDs (batch by 50)
async function getContactTasksByEntityIds(entityIds) {`;

  const NEW = `// Fetch company tasks only for specific entity IDs (batch by 50)
async function getCompanyTasksByEntityIds(entityIds) {
  if (!entityIds || entityIds.length === 0) return [];
  const allTasks = [];
  const batchSize = 50;
  const idArray = Array.from(entityIds);
  for (let i = 0; i < idArray.length; i += batchSize) {
    const batch = idArray.slice(i, i + batchSize);
    await rateLimit();
    const res = await amoClient.get('/api/v4/tasks', {
      params: { filter: { entity_type: 'companies', entity_id: batch }, limit: 250 },
    });
    const tasks = res.data._embedded?.tasks || [];
    allTasks.push(...tasks);
    let hasNext = !!res.data._links?.next;
    let page = 2;
    while (hasNext) {
      await rateLimit();
      const r2 = await amoClient.get('/api/v4/tasks', {
        params: { filter: { entity_type: 'companies', entity_id: batch }, limit: 250, page },
      });
      const more = r2.data._embedded?.tasks || [];
      allTasks.push(...more);
      hasNext = !!r2.data._links?.next;
      page++;
    }
    logger.info(\`AMO: fetched company tasks batch \${Math.floor(i / batchSize) + 1}/\${Math.ceil(idArray.length / batchSize)}\`);
  }
  return allTasks;
}

// Fetch contact tasks only for specific entity IDs (batch by 50)
async function getContactTasksByEntityIds(entityIds) {`;

  if (src.includes(OLD)) {
    src = src.replace(OLD, NEW);
    console.log('OK 1а: getCompanyTasksByEntityIds добавлена');
  } else { console.log('FAIL 1а'); }

  // Добавить в module.exports
  const OLD_EXP = `  getContactTasksByEntityIds,`;
  const NEW_EXP = `  getCompanyTasksByEntityIds,\n  getContactTasksByEntityIds,`;
  if (src.includes(OLD_EXP) && !src.includes('getCompanyTasksByEntityIds,')) {
    src = src.replace(OLD_EXP, NEW_EXP);
    console.log('OK 1б: экспорт добавлен');
  } else { console.log('SKIP 1б: уже есть или не найден'); }

  fs.writeFileSync(path, crlf ? src.replace(/\n/g, '\r\n') : src, 'utf8');
}

// ════════════════════════════════════════════════════════════════
// 2. data.js — качать задачи компаний в кэш
// ════════════════════════════════════════════════════════════════
{
  const path = '/var/www/amoschool/backend/src/routes/data.js';
  let src = fs.readFileSync(path, 'utf8');
  const crlf = src.includes('\r\n'); src = src.replace(/\r\n/g, '\n');

  // 2а. EMPTY_LOADED — добавить companyTasks: 0
  const OLD2A = `  leads: 0, contacts: 0, companies: 0,
  leadTasks: 0, contactTasks: 0,`;
  const NEW2A = `  leads: 0, contacts: 0, companies: 0,
  leadTasks: 0, contactTasks: 0, companyTasks: 0,`;
  if (src.includes(OLD2A)) {
    src = src.replace(OLD2A, NEW2A);
    console.log('OK 2а: companyTasks: 0 в EMPTY_LOADED');
  } else { console.log('FAIL 2а'); }

  // 2б. Добавить загрузку задач компаний после contactTasks
  const OLD2B = `    fetchState.progress.step = 'Загрузка комментариев (deals)...';`;
  const NEW2B = `    fetchState.progress.step = 'Загрузка задач (companies)...';
    const companyIds = new Set(companies.map(c => c.id));
    const companyTasks = await amoApi.getCompanyTasksByEntityIds([...companyIds]);
    fetchState.progress.loaded.companyTasks = companyTasks.length;
    logger.info(\`Data fetch: loaded \${companyTasks.length} company tasks\`);

    fetchState.progress.step = 'Загрузка комментариев (deals)...';`;
  if (src.includes(OLD2B)) {
    src = src.replace(OLD2B, NEW2B);
    console.log('OK 2б: загрузка companyTasks добавлена');
  } else { console.log('FAIL 2б'); }

  // 2в. Добавить companyTasks в counts и data объект
  const OLD2V = `        leadTasks: leadTasks.length,
        contactTasks: contactTasks.length,`;
  const NEW2V = `        leadTasks: leadTasks.length,
        contactTasks: contactTasks.length,
        companyTasks: companyTasks.length,`;
  if (src.includes(OLD2V)) {
    src = src.replace(OLD2V, NEW2V);
    console.log('OK 2в: companyTasks в counts');
  } else { console.log('FAIL 2в'); }

  const OLD2G = `      leadTasks,
      contactTasks,`;
  const NEW2G = `      leadTasks,
      contactTasks,
      companyTasks,`;
  if (src.includes(OLD2G)) {
    src = src.replace(OLD2G, NEW2G);
    console.log('OK 2г: companyTasks в data объект кэша');
  } else { console.log('FAIL 2г'); }

  fs.writeFileSync(path, crlf ? src.replace(/\n/g, '\r\n') : src, 'utf8');
}

// ════════════════════════════════════════════════════════════════
// 3. batchMigrationService.js — читать кэш + переносить + статистика
// ════════════════════════════════════════════════════════════════
{
  const path = '/var/www/amoschool/backend/src/services/batchMigrationService.js';
  let src = fs.readFileSync(path, 'utf8');
  const crlf = src.includes('\r\n'); src = src.replace(/\r\n/g, '\n');

  // 3а. Добавить companyTasks в allTasks при чтении кэша
  const OLD3A = `    ...(cache.leadTasks || []),
    ...(cache.contactTasks || []),`;
  const NEW3A = `    ...(cache.leadTasks || []),
    ...(cache.contactTasks || []),
    ...(cache.companyTasks || []),`;
  if (src.includes(OLD3A)) {
    src = src.replace(OLD3A, NEW3A);
    console.log('OK 3а: companyTasks добавлен в allTasks merge');
  } else { console.log('FAIL 3а'); }

  // 3б. Добавить companies в tasksDetail
  const OLD3B = `    tasksDetail: {
      leads:    { found: 0, created: 0 },
      contacts: { found: 0, created: 0 },
    },`;
  const NEW3B = `    tasksDetail: {
      leads:     { found: 0, created: 0 },
      contacts:  { found: 0, created: 0 },
      companies: { found: 0, created: 0 },
    },`;
  if (src.includes(OLD3B)) {
    src = src.replace(OLD3B, NEW3B);
    console.log('OK 3б: companies добавлен в tasksDetail');
  } else { console.log('FAIL 3б'); }

  // 3в. Добавить блок переноса задач компаний ПОСЛЕ блока контактных задач
  const OLD3V = `    // ── Notes: lead notes (live fetch from AMO) ────────────────────────────────────────`;
  const NEW3V = `    // ── Tasks: company tasks (from cache) ──────────────────────────────────────────
    const neededCompanyIdsForTasks = new Set(
      selectedLeads.flatMap(l => ((l._embedded && l._embedded.companies) || []).map(c => Number(c.id)))
    );
    const companyTasksToTransfer = allTasks.filter(
      t => t.entity_type === 'companies' && neededCompanyIdsForTasks.has(Number(t.entity_id))
    );
    logger.info(\`[transfer] задач компаний в кэше: \${companyTasksToTransfer.length}\`);
    result.tasksDetail.companies.found = companyTasksToTransfer.length;
    if (companyTasksToTransfer.length > 0) {
      try {
        const { transformTask } = require('../utils/dataTransformer');
        const tasksToCreate = companyTasksToTransfer
          .map(t => {
            const kCompanyId = companyIdMap[String(t.entity_id)];
            if (!kCompanyId) return null;
            const tt = transformTask(t);
            tt.entity_id   = Number(kCompanyId);
            tt.entity_type = 'companies';
            return tt;
          })
          .filter(Boolean);
        if (tasksToCreate.length < companyTasksToTransfer.length) {
          const lost = companyTasksToTransfer.length - tasksToCreate.length;
          result.warnings.push(lost + ' задач компаний потеряли привязку (компания не найдена в companyIdMap).');
        }
        if (tasksToCreate.length > 0) {
          logger.info(\`[transfer] создаём \${tasksToCreate.length} задач компаний в Kommo\`);
          const created = await kommoApi.createTasksBatch(tasksToCreate);
          logger.info(\`[transfer] createTasksBatch(companies) вернул \${created.length} объектов\`);
          created.forEach(k => { if (k) { result.createdIds.tasks.push(k.id); result.transferred.tasks++; result.tasksDetail.companies.created++; } });
        }
      } catch (e) {
        result.warnings.push('Задачи компаний: ' + e.message);
        logger.error('[transfer] ошибка задач компаний:', e.message);
      }
    }

    // ── Notes: lead notes (live fetch from AMO) ────────────────────────────────────────`;
  if (src.includes(OLD3V)) {
    src = src.replace(OLD3V, NEW3V);
    console.log('OK 3в: блок переноса задач компаний добавлен');
  } else { console.log('FAIL 3в'); }

  fs.writeFileSync(path, crlf ? src.replace(/\n/g, '\r\n') : src, 'utf8');
}

// ════════════════════════════════════════════════════════════════
// 4. App.jsx — добавить строку "Компании" в детальных задачах
// ════════════════════════════════════════════════════════════════
{
  const path = '/var/www/amoschool/frontend/src/App.jsx';
  let src = fs.readFileSync(path, 'utf8');
  const crlf = src.includes('\r\n'); src = src.replace(/\r\n/g, '\n');

  const OLD4 = `                              <div>🔹 Сделки: найдено {singleTransferResult.tasksDetail.leads?.found ?? '—'}, перенесено <strong>{singleTransferResult.tasksDetail.leads?.created ?? '—'}</strong></div>
                              <div>🔹 Контакты: найдено {singleTransferResult.tasksDetail.contacts?.found ?? '—'}, перенесено <strong>{singleTransferResult.tasksDetail.contacts?.created ?? '—'}</strong></div>`;
  const NEW4 = `                              <div>🔹 Сделки: найдено {singleTransferResult.tasksDetail.leads?.found ?? '—'}, перенесено <strong>{singleTransferResult.tasksDetail.leads?.created ?? '—'}</strong></div>
                              <div>🔹 Контакты: найдено {singleTransferResult.tasksDetail.contacts?.found ?? '—'}, перенесено <strong>{singleTransferResult.tasksDetail.contacts?.created ?? '—'}</strong></div>
                              <div>🔹 Компании: найдено {singleTransferResult.tasksDetail.companies?.found ?? '—'}, перенесено <strong>{singleTransferResult.tasksDetail.companies?.created ?? '—'}</strong></div>`;
  if (src.includes(OLD4)) {
    src = src.replace(OLD4, NEW4);
    console.log('OK 4: App.jsx — строка Компании в задачах');
  } else { console.log('FAIL 4'); }

  fs.writeFileSync(path, crlf ? src.replace(/\n/g, '\r\n') : src, 'utf8');
}

console.log('\nВсе патчи завершены.');
