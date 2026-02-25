/**
 * batchMigrationService.js
 * Handles batch/filtered lead migration from cached amo CRM data
 */
const path = require('path');
const fs = require('fs-extra');
const amoApi = require('./amoApi');
const kommoApi = require('./kommoApi');
const config = require('../config');
const logger = require('../utils/logger');
const { loadFieldMapping, buildAllFieldMappings, saveFieldMapping } = require('../utils/fieldMapping');
const safety = require('../utils/safetyGuard');

const CACHE_FILE = path.resolve(config.backupDir, 'amo_data_cache.json');
const BATCH_CONFIG_FILE = path.resolve(config.backupDir, 'batch_config.json');

// ─── State ────────────────────────────────────────────────────────────────────
let batchState = {
  status: 'idle', // idle | running | completed | error | rolling_back
  step: null,
  progress: { current: 0, total: 0 },
  errors: [],
  warnings: [],
  createdIds: { contacts: [], companies: [], leads: [], tasks: [], notes: [] },
  stats: { totalEligible: 0, totalTransferred: 0, remainingLeads: 0 },
  startedAt: null,
  completedAt: null,
};

let batchConfig = {
  managerIds: [],   // [] = all managers
  batchSize: 10,
  offset: 0,        // number of eligible leads already transferred
  stageMapping: {},
};

// ─── Config helpers ───────────────────────────────────────────────────────────
function loadBatchConfig() {
  if (fs.existsSync(BATCH_CONFIG_FILE)) {
    try { batchConfig = { ...batchConfig, ...fs.readJsonSync(BATCH_CONFIG_FILE) }; } catch {}
  }
  return batchConfig;
}

function saveBatchConfig() {
  fs.ensureDirSync(path.dirname(BATCH_CONFIG_FILE));
  fs.writeJsonSync(BATCH_CONFIG_FILE, batchConfig, { spaces: 2 });
}

function getBatchConfig() { loadBatchConfig(); return { ...batchConfig }; }

function setBatchConfig(updates) {
  loadBatchConfig();
  batchConfig = { ...batchConfig, ...updates };
  saveBatchConfig();
}

function getBatchState() { return { ...batchState }; }

// ─── State helpers ────────────────────────────────────────────────────────────
function updateState(u) { batchState = { ...batchState, ...u }; }

function addError(message, recommendation) {
  batchState.errors.push({ timestamp: new Date().toISOString(), message, recommendation: recommendation || null });
  logger.error(`[batch] ${message}`);
}

function addWarning(message, recommendation) {
  batchState.warnings.push({ timestamp: new Date().toISOString(), message, recommendation: recommendation || null });
  logger.warn(`[batch] ${message}`);
}

// ─── Cache helpers ────────────────────────────────────────────────────────────
function loadAmoCache() {
  if (!fs.existsSync(CACHE_FILE)) {
    throw new Error('Данные не загружены. Перейдите на вкладку "Данные amo" и нажмите "Загрузить данные".');
  }
  return fs.readJsonSync(CACHE_FILE);
}

function getEligibleLeads(leads, managerIds) {
  if (!managerIds || managerIds.length === 0) return leads;
  const idSet = new Set(managerIds.map(Number));
  return leads.filter(l => idSet.has(l.responsible_user_id));
}

// ─── Analyse managers ─────────────────────────────────────────────────────────
async function analyzeManagers() {
  const cache = loadAmoCache();
  const leads = cache.leads || [];

  let usersMap = {};
  try {
    const users = await amoApi.getUsers();
    users.forEach(u => { usersMap[u.id] = u; });
  } catch (e) {
    logger.warn('Could not fetch users: ' + e.message);
  }

  const counts = {};
  leads.forEach(lead => {
    const uid = lead.responsible_user_id;
    if (!uid) return;
    if (!counts[uid]) {
      counts[uid] = {
        id: uid,
        name: usersMap[uid]?.name || `Менеджер #${uid}`,
        email: usersMap[uid]?.email || '',
        leadCount: 0,
      };
    }
    counts[uid].leadCount++;
  });

  const cfg = getBatchConfig();
  const managers = Object.values(counts).sort((a, b) => b.leadCount - a.leadCount);
  const eligibleCount = getEligibleLeads(leads, cfg.managerIds).length;

  return {
    totalLeads: leads.length,
    managers,
    currentManagerIds: cfg.managerIds,
    eligibleCount,
    dataFetchedAt: cache.fetchedAt,
  };
}

// ─── Live stats ───────────────────────────────────────────────────────────────
function getStats() {
  const cfg = getBatchConfig();
  let cache = null;
  try { cache = loadAmoCache(); } catch { return null; }

  const leads = cache?.leads || [];
  const eligible = getEligibleLeads(leads, cfg.managerIds);
  const transferred = cfg.offset;
  return {
    totalEligible: eligible.length,
    totalTransferred: transferred,
    remainingLeads: Math.max(0, eligible.length - transferred),
    batchSize: cfg.batchSize,
    managerIds: cfg.managerIds,
    dataFetchedAt: cache?.fetchedAt,
  };
}

// ─── Main batch migration ─────────────────────────────────────────────────────
async function runBatchMigration(stageMapping) {
  if (batchState.status === 'running') throw new Error('Пакетная миграция уже выполняется');

  loadBatchConfig();

  updateState({
    status: 'running',
    step: 'Инициализация пакета...',
    errors: [], warnings: [],
    progress: { current: 0, total: 0 },
    createdIds: { contacts: [], companies: [], leads: [], tasks: [], notes: [] },
    stats: { totalEligible: 0, totalTransferred: batchConfig.offset, remainingLeads: 0 },
    startedAt: new Date().toISOString(),
    completedAt: null,
  });

  try {
    /* ── 1. Load cache ─────────────────────────────────────────────── */
    let cache;
    try { cache = loadAmoCache(); } catch (e) {
      addError(e.message, 'Перейдите на вкладку "Данные amo" и нажмите "Загрузить данные".');
      updateState({ status: 'error', completedAt: new Date().toISOString() });
      return;
    }

    const allLeads     = cache.leads     || [];
    const allContacts  = cache.contacts  || [];
    const allCompanies = cache.companies || [];
    const allTasks     = cache.tasks     || [];

    /* ── 2. Filter by managers ──────────────────────────────────────── */
    const eligible = getEligibleLeads(allLeads, batchConfig.managerIds);
    batchState.stats.totalEligible = eligible.length;
    batchState.stats.remainingLeads = Math.max(0, eligible.length - batchConfig.offset);

    if (eligible.length === 0) {
      addWarning(
        batchConfig.managerIds.length === 0
          ? 'Нет сделок для переноса. Данные могут быть не загружены.'
          : 'Нет сделок для выбранных менеджеров.',
        'Выберите других менеджеров или загрузите актуальные данные из amo CRM.'
      );
      updateState({ status: 'completed', step: 'Нет данных для переноса', completedAt: new Date().toISOString() });
      return;
    }

    /* ── 3. Get current batch ───────────────────────────────────────── */
    const from = batchConfig.offset;
    const batchLeads = eligible.slice(from, from + batchConfig.batchSize);

    if (batchLeads.length === 0) {
      addWarning(
        `Все ${eligible.length} сделок уже перенесены (смещение: ${from}).`,
        'Для нового цикла переноса нажмите "Сбросить счётчик".'
      );
      updateState({ status: 'completed', step: 'Все сделки перенесены', completedAt: new Date().toISOString() });
      return;
    }

    updateState({ step: `Пакет: сделки ${from + 1}–${from + batchLeads.length} из ${eligible.length}`, progress: { current: 0, total: batchLeads.length } });
    logger.info(`Batch: migrating leads ${from}–${from + batchLeads.length - 1} / ${eligible.length}`);

    /* ── 4. Validate stages ─────────────────────────────────────────── */
    if (!stageMapping || Object.keys(stageMapping).length === 0) {
      addWarning('Маппинг этапов пустой.', 'Нажмите "Синхронизировать этапы" перед запуском миграции.');
    } else {
      const unmapped = new Set();
      batchLeads.forEach(l => {
        if (l.status_id && !stageMapping[l.status_id] && ![142, 143].includes(l.status_id))
          unmapped.add(l.status_id);
      });
      if (unmapped.size > 0) {
        addWarning(
          `Этапы [${[...unmapped].join(', ')}] отсутствуют в маппинге — сделки попадут в первый доступный этап.`,
          'Выполните "Синхронизировать этапы" для создания недостающих этапов в Kommo CRM.'
        );
      }
    }

    /* ── 5. Validate contacts ───────────────────────────────────────── */
    const noContact = batchLeads.filter(l => !l._embedded?.contacts?.length).length;
    if (noContact > 0) {
      addWarning(
        `${noContact} сделок не имеют привязанных контактов.`,
        'Убедитесь, что это корректно. Сделки без контактов будут перенесены как есть.'
      );
    }

    /* ── 6. Collect related entities ────────────────────────────────── */
    const neededContactIds  = new Set(batchLeads.flatMap(l => (l._embedded?.contacts  || []).map(c => c.id)));
    const neededCompanyIds  = new Set(batchLeads.flatMap(l => (l._embedded?.companies || []).map(c => c.id)));
    const batchContacts  = allContacts.filter(c => neededContactIds.has(c.id));
    const batchCompanies = allCompanies.filter(c => neededCompanyIds.has(c.id));

    /* ── 6b. Load field mappings ────────────────────────────────────── */
    let fieldMappings = loadFieldMapping();
    if (!fieldMappings) {
      addWarning(
        'Маппинг кастомных полей не найден.',
        'Выполните "Синхронизировать поля" для переноса кастомных полей. Без маппинга кастомные поля переноситься не будут.'
      );
      fieldMappings = { leads: null, contacts: null, companies: null };
    }

    /* ── 7. Migrate companies ───────────────────────────────────────── */
    updateState({ step: `Перенос компаний (${batchCompanies.length})...` });
    const companyIdMap = {};
    if (batchCompanies.length > 0) {
      const { transformCompany } = require('../utils/dataTransformer');
      // ═ САФЕТИ: исключаем уже перенесённые компании ════════
      const { toCreate: companiesToCreate, skipped: companiesSkipped } =
        safety.filterNotMigrated('companies', batchCompanies, c => c.id);
      if (companiesSkipped.length > 0) {
        addWarning(
          `▶️ ${companiesSkipped.length} компаний уже перенесены ранее — пропущены (перезапись запрещена).`,
          'Данные в Kommo не изменены. Если перенес нужно повторить — сбросьте индекс через вкладку Бэкапы.'
        );
        // Добавляем уже известные пары в idMap из индекса
        companiesSkipped.forEach(({ amoId, kommoId }) => { companyIdMap[amoId] = kommoId; });
      }
      try {
        if (companiesToCreate.length > 0) {
          const created = await kommoApi.createCompaniesBatch(companiesToCreate.map(c => transformCompany(c, fieldMappings.companies)));
          const pairs = [];
          created.forEach((k, i) => {
            if (k && companiesToCreate[i]) {
              companyIdMap[companiesToCreate[i].id] = k.id;
              batchState.createdIds.companies.push(k.id);
              pairs.push({ amoId: companiesToCreate[i].id, kommoId: k.id });
            }
          });
          safety.registerMigratedBatch('companies', pairs);
        }
      } catch (e) {
        if (e.isSafetyError) {
          addError(`⛔ ${e.message}`);
        } else {
          addError(`Ошибка переноса компаний: ${e.message}`, 'Проверьте API-токен Kommo CRM и повторите попытку.');
        }
        updateState({ status: 'error', completedAt: new Date().toISOString() }); return;
      }
    }

    /* ── 8. Migrate contacts ────────────────────────────────────────── */
    updateState({ step: `Перенос контактов (${batchContacts.length})...` });
    const contactIdMap = {};
    if (batchContacts.length > 0) {
      const { transformContact } = require('../utils/dataTransformer');
      // ═ САФЕТИ: исключаем уже перенесённые контакты ════════
      const { toCreate: contactsToCreate, skipped: contactsSkipped } =
        safety.filterNotMigrated('contacts', batchContacts, c => c.id);
      if (contactsSkipped.length > 0) {
        addWarning(
          `▶️ ${contactsSkipped.length} контактов уже перенесены ранее — пропущены (перезапись запрещена).`,
          'Данные в Kommo не изменены.'
        );
        contactsSkipped.forEach(({ amoId, kommoId }) => { contactIdMap[amoId] = kommoId; });
      }
      try {
        if (contactsToCreate.length > 0) {
          const created = await kommoApi.createContactsBatch(contactsToCreate.map(c => transformContact(c, fieldMappings.contacts)));
          const pairs = [];
          created.forEach((k, i) => {
            if (k && contactsToCreate[i]) {
              contactIdMap[contactsToCreate[i].id] = k.id;
              batchState.createdIds.contacts.push(k.id);
              pairs.push({ amoId: contactsToCreate[i].id, kommoId: k.id });
            }
          });
          safety.registerMigratedBatch('contacts', pairs);
        }
      } catch (e) {
        if (e.isSafetyError) {
          addError(`⛔ ${e.message}`);
        } else {
          addError(`Ошибка переноса контактов: ${e.message}`, 'Проверьте API-токен Kommo CRM и повторите попытку.');
        }
        updateState({ status: 'error', completedAt: new Date().toISOString() }); return;
      }
    }

    /* ── 9. Migrate leads ───────────────────────────────────────────── */
    updateState({ step: `Перенос сделок (${batchLeads.length})...` });
    const { transformLead } = require('../utils/dataTransformer');
    const leadsToCreate = batchLeads.map(lead => {
      const t = transformLead(lead, stageMapping || {}, fieldMappings.leads);
      t.pipeline_id = config.kommo.pipelineId;
      return t;
    });

    let createdLeads;
    try {
      createdLeads = await kommoApi.createLeadsBatch(leadsToCreate);
    } catch (e) {
      addError(`Ошибка переноса сделок: ${e.message}`, 'Уменьшите размер пакета или проверьте лимиты API Kommo CRM.');
      updateState({ status: 'error', completedAt: new Date().toISOString() }); return;
    }

    const leadIdMap = {};
    for (let idx = 0; idx < createdLeads.length; idx++) {
      const kLead = createdLeads[idx];
      const aLead = batchLeads[idx];
      if (!kLead || !aLead) continue;
      leadIdMap[aLead.id] = kLead.id;
      batchState.createdIds.leads.push(kLead.id);
      leadPairs.push({ amoId: aLead.id, kommoId: kLead.id });

      for (const c of (aLead._embedded?.contacts || [])) {
        const kId = contactIdMap[c.id];
        if (kId) {
          try { await kommoApi.linkContactToLead(kLead.id, kId); } catch (e) {
            addWarning(`Не удалось привязать контакт #${c.id} к сделке #${aLead.id}.`, 'Привяжите контакт вручную в Kommo CRM.');
          }
        }
      }
      for (const c of (aLead._embedded?.companies || [])) {
        const kId = companyIdMap[c.id];
        if (kId) {
          try { await kommoApi.linkCompanyToLead(kLead.id, kId); } catch (e) {
            addWarning(`Не удалось привязать компанию #${c.id} к сделке #${aLead.id}.`, 'Привяжите компанию вручную в Kommo CRM.');
          }
        }
      }
      batchState.progress.current = idx + 1;
    }
    // Регистрируем все перенесённые сделки в индексе безопасности
    if (leadPairs.length > 0) safety.registerMigratedBatch('leads', leadPairs);

    /* ── 10. Migrate tasks ──────────────────────────────────────────── */
    const batchAmoIds = new Set(batchLeads.map(l => l.id));
    const batchTasks  = allTasks.filter(t => t.entity_type === 'leads' && batchAmoIds.has(t.entity_id));

    if (batchTasks.length > 0) {
      updateState({ step: `Перенос задач (${batchTasks.length})...` });
      const { transformTask } = require('../utils/dataTransformer');
      const tasksToCreate = batchTasks.map(t => {
        const tt = transformTask(t);
        tt.entity_id = leadIdMap[t.entity_id];
        tt.entity_type = 'leads';
        return tt;
      }).filter(t => t.entity_id);

      if (tasksToCreate.length < batchTasks.length) {
        addWarning(
          `${batchTasks.length - tasksToCreate.length} задач потеряли привязку к сделкам.`,
          'Это ожидаемо, если сделки не попали в текущий пакет. Задачи перенесутся при переносе соответствующих сделок.'
        );
      }
      try {
        const created = await kommoApi.createTasksBatch(tasksToCreate);
        created.forEach(k => { if (k) batchState.createdIds.tasks.push(k.id); });
      } catch (e) {
        addWarning(`Ошибка переноса задач: ${e.message}`, 'Попробуйте повторить пакет или добавьте задачи вручную.');
      }
    }

    /* ── 11. Migrate notes / timeline ───────────────────────────────── */
    updateState({ step: 'Перенос комментариев...' });
    for (const aLead of batchLeads) {
      const kId = leadIdMap[aLead.id];
      if (!kId) continue;
      try {
        const notes = await amoApi.getLeadNotes(aLead.id);
        if (notes.length > 0) {
          const n = notes.map(note => ({ entity_id: kId, note_type: note.note_type || 'common', params: note.params || {}, created_at: note.created_at }));
          const created = await kommoApi.createNotesBatch('leads', n);
          created.forEach(n => { if (n) batchState.createdIds.notes.push(n.id); });
        }
      } catch (e) {
        addWarning(`Не удалось перенести заметки сделки #${aLead.id}.`, 'Добавьте заметки вручную в Kommo CRM.');
      }
    }

    /* ── 12. Update offset ──────────────────────────────────────────── */
    batchConfig.offset = from + batchLeads.length;
    batchState.stats.totalTransferred = batchConfig.offset;
    batchState.stats.remainingLeads   = Math.max(0, eligible.length - batchConfig.offset);
    saveBatchConfig();

    updateState({
      status: batchState.errors.length > 0 ? 'error' : 'completed',
      step: `✅ Пакет завершён: +${batchLeads.length} сделок. Всего: ${batchConfig.offset}/${eligible.length}`,
      completedAt: new Date().toISOString(),
    });

    logger.info(`Batch done: +${batchLeads.length} leads, total ${batchConfig.offset}/${eligible.length}`);

  } catch (err) {
    addError(`Критическая ошибка: ${err.message}`, 'Проверьте логи сервера. При необходимости выполните откат последнего пакета.');
    updateState({ status: 'error', completedAt: new Date().toISOString() });
    logger.error('Batch migration fatal error:', err);
  }
}

// ─── Rollback ─────────────────────────────────────────────────────────────────
async function rollbackBatch() {
  const ids = batchState.createdIds;
  updateState({ status: 'rolling_back' });
  try {
    // ═ САФЕТИ: при откате удаляем ТОЛЬКО те записи, которые создали САМИ
    // (batchState.createdIds). Записи, которых нет в createdIds, не трогаем.
    if (ids.leads?.length) {
      const { safe: safeLeads, blocked: blockedLeads } =
        safety.validateRollbackIds('leads', ids.leads, ids.leads);
      if (blockedLeads.length > 0)
        addWarning(`⛔ Откат: ${blockedLeads.length} сделок заблокированы (не созданы в этом пакете).`);
      if (safeLeads.length > 0) await kommoApi.deleteLeadsBatch(safeLeads);
    }
    if (ids.contacts?.length) {
      const { safe: safeContacts, blocked: blockedContacts } =
        safety.validateRollbackIds('contacts', ids.contacts, ids.contacts);
      if (blockedContacts.length > 0)
        addWarning(`⛔ Откат: ${blockedContacts.length} контактов заблокированы.`);
      if (safeContacts.length > 0) await kommoApi.deleteContactsBatch(safeContacts);
    }
    if (ids.companies?.length) {
      const { safe: safeCompanies, blocked: blockedCompanies } =
        safety.validateRollbackIds('companies', ids.companies, ids.companies);
      if (blockedCompanies.length > 0)
        addWarning(`⛔ Откат: ${blockedCompanies.length} компаний заблокированы.`);
      if (safeCompanies.length > 0) await kommoApi.deleteCompaniesBatch(safeCompanies);
    }

    // Убираем откаченные сделки из индекса
    if (ids.leads?.length) {
      const idx = safety.loadIndex();
      for (const kommoId of ids.leads) {
        const entry = Object.entries(idx.leads || {}).find(([_a, k]) => k === String(kommoId));
        if (entry) delete idx.leads[entry[0]];
      }
      require('../utils/safetyGuard'); // re-save via module
      const fs2 = require('fs-extra');
      const p2  = require('path');
      const cfg2 = require('../config');
      fs2.writeJsonSync(p2.resolve(cfg2.backupDir, 'migration_index.json'), idx, { spaces: 2 });
    }

    batchConfig.offset = Math.max(0, batchConfig.offset - (ids.leads?.length || 0));
    saveBatchConfig();

    updateState({ status: 'idle', step: null, createdIds: { contacts: [], companies: [], leads: [], tasks: [], notes: [] } });
    logger.info('Batch rollback complete');
  } catch (e) {
    addError(`Ошибка отката: ${e.message}`, 'Часть данных могла не удалиться. Проверьте Kommo CRM вручную.');
    updateState({ status: 'error' });
  }
}

function resetOffset() {
  loadBatchConfig();
  batchConfig.offset = 0;
  saveBatchConfig();
}

module.exports = { getBatchConfig, setBatchConfig, getBatchState, analyzeManagers, getStats, runBatchMigration, rollbackBatch, resetOffset, loadBatchConfig };
