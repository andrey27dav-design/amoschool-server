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
const { fmtDatePrefix } = require('../utils/dataTransformer');
const safety = require('../utils/safetyGuard');

const CACHE_FILE = path.resolve(config.backupDir, 'amo_data_cache.json');
const BATCH_CONFIG_FILE = path.resolve(config.backupDir, 'batch_config.json');

// ─── State ────────────────────────────────────────────────────────────────────
let pauseRequestedFlag = false;
let autoRunEnabled = false;    // auto-run cycle active
let autoRunStopFlag = false;   // user pressed stop during countdown
let autoRunContinueFlag = false; // frontend signals: countdown done, start next batch

let batchState = {
  status: 'idle', // idle | running | completed | error | rolling_back | paused | auto-waiting
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
  migrationMode: 'all', // 'all' | 'fix-existing' | 'new-only'
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

function addWarning(message, recommendation, details) {
  const entry = { timestamp: new Date().toISOString(), message, recommendation: recommendation || null };
  if (details && details.length > 0) entry.details = details;
  batchState.warnings.push(entry);
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

  // Use migration_index.json minus session baseline to get "already migrated THIS funnel session".
  // The baseline is snap-shotted when: (1) new AMO data is loaded, (2) "Сбросить счётчик" is pressed.
  // This prevents stale counts from old funnels leaking into the new funnel display.
  let alreadyMigrated = 0;
  try {
    const idxPath  = path.resolve(config.backupDir, 'migration_index.json');
    const basePath = path.resolve(config.backupDir, 'session_baseline.json');
    if (fs.existsSync(idxPath)) {
      const idx = fs.readJsonSync(idxPath);
      const totalInIndex = idx.leads ? Object.keys(idx.leads).length : 0;
      let baseLeads = 0;
      if (fs.existsSync(basePath)) {
        try { baseLeads = (fs.readJsonSync(basePath)).leads || 0; } catch {}
      }
      alreadyMigrated = Math.max(0, totalInIndex - baseLeads);
    }
  } catch {}

  return {
    totalEligible: eligible.length,
    totalTransferred: cfg.offset,          // batch cursor for this session (used for paging)
    alreadyMigrated,                        // total ever migrated (all sessions)
    remainingLeads: Math.max(0, eligible.length - alreadyMigrated),
    batchSize: cfg.batchSize,
    managerIds: cfg.managerIds,
    dataFetchedAt: cache?.fetchedAt,
  };
}

// ─── Main batch migration ─────────────────────────────────────────────────────
/**
 * Sanitize AMO note for Kommo API.
 * - Removes null/undefined values from params (causes 400).
 * - Normalises note_type: keeps as-is for supported types.
 */
function sanitizeNoteParams(note) {
  let params = note.params;
  if (params && typeof params === 'object') {
    // Deep-copy and strip null/undefined values
    params = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== null && v !== undefined)
    );
  } else {
    params = {};
  }
  // Prepend original AMO creation date (📅 DD.MM.YYYY HH:MM) to note text
  if (note.created_at && params.text) {
    params.text = fmtDatePrefix(note.created_at) + params.text;
  }

  // Kommo API does not accept 'service_message' as note_type when creating notes.
  // Convert it to 'common' so the text content is preserved as a regular comment.
  // Also remove the 'service' field which is AMO-specific and not accepted by Kommo.
  let noteType = note.note_type;
  if (noteType === 'service_message') {
    noteType = 'common';
    delete params.service;
  }

  // For call_out/call_in: embed original AMO date in call_result field (visible in Kommo UI)
  if (note.created_at && (noteType === 'call_out' || noteType === 'call_in') && !params.call_result) {
    params.call_result = fmtDatePrefix(note.created_at).trim();
  }

  // Kommo requires params.duration to be int (some providers like TELPHIN send it as string)
  if (params.duration !== undefined) {
    params.duration = parseInt(params.duration, 10) || 0;
  }

  return {
    note_type: noteType,
    params,
  };
}

// Note types to skip: 10 = incoming call, 11 = outgoing call (have null params.link)
const SKIP_NOTE_TYPES = new Set([10, 11, 'amomail_message', 'extended_service_message', 'lead_auto_created', 'attachment', 'link_followed']);

async function runBatchMigration(stageMapping) {
  if (batchState.status === 'running') throw new Error('Пакетная миграция уже выполняется');

  // Reset stale flags from previous stop (prevents phantom pause on new batch)
  pauseRequestedFlag = false;
  if (!autoRunEnabled) autoRunStopFlag = false;

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
    // Support both new format (leadTasks/contactTasks) and legacy (tasks)
    const allTasks = [
      ...(cache.leadTasks    || []),
      ...(cache.contactTasks || []),
      ...(cache.companyTasks || []),
      ...(cache.tasks        || []),
    ];

    /* ── 2. Filter by managers ──────────────────────────────────────── */
    let eligible = getEligibleLeads(allLeads, batchConfig.managerIds);

    /* ── 2b. Filter by migration mode ───────────────────────────────── */
    const _mode = batchConfig.migrationMode || 'all';
    const _skipCreate = (_mode === 'fix-existing');  // don't create new entities, only PATCH existing
    const _skipPatch  = (_mode === 'new-only');       // don't patch existing, only create new
    if (_mode === 'fix-existing' || _mode === 'new-only') {
      const _modeIdx = safety.loadIndex();
      const _modeIdxLeads = _modeIdx.leads || {};
      if (_mode === 'fix-existing') {
        eligible = eligible.filter(l => !!_modeIdxLeads[String(l.id)]);
        logger.info(`[batch] Mode=fix-existing: ${eligible.length} leads already in index`);
      } else {
        eligible = eligible.filter(l => !_modeIdxLeads[String(l.id)]);
        logger.info(`[batch] Mode=new-only: ${eligible.length} leads NOT in index`);
      }
    }

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
    // batchSize === 0 means "transfer ALL remaining"
    const batchLeads = batchConfig.batchSize === 0
      ? eligible.slice(from)
      : eligible.slice(from, from + batchConfig.batchSize);

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
    const leadsNoContact = batchLeads.filter(l => !l._embedded?.contacts?.length);
    if (leadsNoContact.length > 0) {
      const _safetyIdx = safety.loadIndex();
      const _ncDetails = leadsNoContact.map(l => {
        const _kId = (_safetyIdx.leads || {})[String(l.id)];
        const _kPart = _kId ? ' \u2192 Kommo#' + _kId : '';
        return 'Сделка AMO#' + l.id + _kPart + ' (' + (l.name || 'без названия').substring(0, 40) + ')';
      });
      addWarning(
        `${leadsNoContact.length} сделок не имеют привязанных контактов.`,
        'Убедитесь, что это корректно. Сделки без контактов будут перенесены как есть.',
        _ncDetails
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

      // --- User mapping for batch ---
      const userMap = {};
      try {
        const db = require('../db');
        const ums = db.getUserMappings ? db.getUserMappings() : [];
        ums.forEach(m => { userMap[m.amo_user_id] = m.kommo_user_id; userMap[String(m.amo_user_id)] = m.kommo_user_id; });
      } catch (e) { /* proceed without user mapping */ }

    /* ── 7. Migrate companies ───────────────────────────────────────── */
        // pause before companies (safe: nothing written to Kommo yet)
    if (pauseRequestedFlag) {
      pauseRequestedFlag = false;
      saveBatchConfig();
      updateState({ status: 'paused', step: '⏸ Пауза перед переносом компаний', completedAt: new Date().toISOString() });
      logger.info('Batch paused before companies');
      return;
    }
    updateState({ step: `Перенос компаний (${batchCompanies.length})...` });
    const companyIdMap = {};
    if (batchCompanies.length > 0) {
      const { transformCompany } = require('../utils/dataTransformer');
      // ═ САФЕТИ: исключаем уже перенесённые компании ════════
      const { toCreate: companiesToCreate, skipped: companiesSkipped } =
        safety.filterNotMigrated('companies', batchCompanies, c => c.id);
      if (companiesSkipped.length > 0) {
        const _csIdx = safety.loadIndex();
        const _csDetails = companiesSkipped.map(({ item, amoId, kommoId }) => {
          const allLinkedLeads = (item && item._embedded && item._embedded.leads) ? item._embedded.leads.map(l => l.id) : [];
          const linkedLeads = allLinkedLeads.map(lid => {
            const _kLid = (_csIdx.leads || {})[String(lid)];
            return 'AMO#' + lid + (_kLid ? '/Kommo#' + _kLid : '');
          }).join(', ');
          return `Компания AMO#${amoId} → Kommo#${kommoId}` + (linkedLeads ? ` (привязана к сделкам: ${linkedLeads})` : '');
        });
        addWarning(
          `▶️ ${companiesSkipped.length} компаний уже перенесены ранее — пропущены (перезапись запрещена).`,
          'Данные в Kommo не изменены. Если перенос нужно повторить — сбросьте индекс через вкладку Бэкапы.',
          _csDetails
        );
        // Добавляем уже известные пары в idMap из индекса
        companiesSkipped.forEach(({ amoId, kommoId }) => { companyIdMap[amoId] = kommoId; });
      }
      try {
        if (companiesToCreate.length > 0) {
          const created = await kommoApi.createCompaniesBatch(companiesToCreate.map(c => transformCompany(c, fieldMappings.companies, userMap)));
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

    /* ── 7b. Build contact→lead manager fallback map ────────────────── */
    // For contacts whose AMO user is not in userMap, fall back to lead's mapped manager
    const contactLeadManagerMap = {};
    for (const lead of batchLeads) {
      const amoLeadUid = lead.responsible_user_id;
      const kommoLeadUid = amoLeadUid ? (userMap[amoLeadUid] || userMap[String(amoLeadUid)]) : null;
      if (kommoLeadUid) {
        for (const c of (lead._embedded?.contacts || [])) {
          if (!contactLeadManagerMap[c.id]) contactLeadManagerMap[c.id] = Number(kommoLeadUid);
        }
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
        const _ctIdx = safety.loadIndex();
        const _ctDetails = contactsSkipped.map(({ item, amoId, kommoId }) => {
          const allLinkedLeads = (item && item._embedded && item._embedded.leads) ? item._embedded.leads.map(l => l.id) : [];
          const linkedLeads = allLinkedLeads.map(lid => {
            const _kLid = (_ctIdx.leads || {})[String(lid)];
            return 'AMO#' + lid + (_kLid ? '/Kommo#' + _kLid : '');
          }).join(', ');
          return `Контакт AMO#${amoId} → Kommo#${kommoId}` + (linkedLeads ? ` (нужен для сделок: ${linkedLeads})` : '');
        });
        addWarning(
          `▶️ ${contactsSkipped.length} контактов уже перенесены ранее — пропущены (перезапись запрещена).`,
          'Данные в Kommo не изменены. Контакт остаётся привязан к ранее перенесённым сделкам и будет также привязан к новым.',
          _ctDetails
        );
        contactsSkipped.forEach(({ amoId, kommoId }) => { contactIdMap[amoId] = kommoId; });
      }
      try {
        if (contactsToCreate.length > 0) {
          const created = await kommoApi.createContactsBatch(contactsToCreate.map(c => {
            const t = transformContact(c, fieldMappings.contacts, userMap);
            // Fallback: if contact has no mapped manager, use lead's manager
            if (!t.responsible_user_id && contactLeadManagerMap[c.id]) {
              t.responsible_user_id = contactLeadManagerMap[c.id];
            }
            return t;
          }));
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

    // ╔ SAFE: исключаем уже перенесённые сделки ════════════════════════
    const { toCreate: newLeads, skipped: skippedLeads } =
      safety.filterNotMigrated('leads', batchLeads, l => l.id);
    if (skippedLeads.length > 0) {
      const _slDetails = skippedLeads.map(({ item, amoId, kommoId }) => {
        const _name = (item && item.name) ? ' (' + item.name.substring(0, 40) + ')' : '';
        return 'Сделка AMO#' + amoId + ' \u2192 Kommo#' + kommoId + _name;
      });
      addWarning(
        `▶️ ${skippedLeads.length} сделок уже перенесены ранее — пропущены (перезапись запрещена).`,
        'Данные в Kommo не изменены. Чтобы перенести повторно — сбросьте индекс через вкладку Бэкап.',
        _slDetails
      );
    }
    // Pre-populate leadIdMap для skipped сделок (нужно для задач/заметок)
    const leadIdMap = {};
    skippedLeads.forEach(({ amoId, kommoId }) => { leadIdMap[Number(amoId)] = Number(kommoId); });

    const leadsToCreate = newLeads.map(lead => {
      const t = transformLead(lead, stageMapping || {}, fieldMappings.leads, userMap);
      t.pipeline_id = (stageMapping && stageMapping._pipeline && stageMapping._pipeline.kommo) ? stageMapping._pipeline.kommo : config.kommo.pipelineId;
      // Embed contacts + companies directly in lead creation payload (bulk, no separate link calls)
      const embContacts = (lead._embedded?.contacts || [])
        .map(c => contactIdMap[c.id]).filter(Boolean).map(id => ({ id: Number(id) }));
      const embCompanies = (lead._embedded?.companies || [])
        .map(c => companyIdMap[c.id]).filter(Boolean).map(id => ({ id: Number(id) }));
      if (embContacts.length > 0 || embCompanies.length > 0) {
        t._embedded = {};
        if (embContacts.length > 0) t._embedded.contacts = embContacts;
        if (embCompanies.length > 0) t._embedded.companies = embCompanies;
      }
      return t;
    });

    let createdLeads = [];
    if (newLeads.length > 0) {
    try {
      createdLeads = await kommoApi.createLeadsBatch(leadsToCreate);
    } catch (e) {
      addError(`Ошибка переноса сделок: ${e.message}`, 'Уменьшите размер пакета или проверьте лимиты API Kommo CRM.');
      updateState({ status: 'error', completedAt: new Date().toISOString() }); return;
    }
    } // end if (newLeads.length > 0)

    // leadIdMap declared above (see SAFE dedup block)
    const leadPairs = [];
    for (let idx = 0; idx < createdLeads.length; idx++) {
      const kLead = createdLeads[idx];
      const aLead = newLeads[idx];       // ← только новые (не skipped)
      if (!kLead || !aLead) continue;
      leadIdMap[aLead.id] = kLead.id;
      batchState.createdIds.leads.push(kLead.id);
      leadPairs.push({ amoId: aLead.id, kommoId: kLead.id });
      batchState.progress.current = idx + 1;
    }
    // Регистрируем все перенесённые сделки в индексе безопасности
    if (leadPairs.length > 0) safety.registerMigratedBatch('leads', leadPairs);

    // Reverse map: Kommo lead ID -> AMO lead ID (for warning messages)
    const kommoToAmoLead = {};
    for (const [aId, kId] of Object.entries(leadIdMap)) kommoToAmoLead[kId] = aId;


    // Pause check after leads (saves offset, stops before tasks)
    if (pauseRequestedFlag) {
      pauseRequestedFlag = false;
      batchConfig.offset = from + batchLeads.length;
      batchState.stats.totalTransferred = batchConfig.offset;
      batchState.stats.remainingLeads   = Math.max(0, eligible.length - batchConfig.offset);
      saveBatchConfig();
      updateState({ status: 'paused', step: '⏸ Пауза после сделок. Задачи/заметки будут при следующем запуске', completedAt: new Date().toISOString() });
      logger.info('Batch paused after leads, offset=' + batchConfig.offset);
      return;
    }
        /* ── 10. Migrate tasks ──────────────────────────────────────────── */
    const batchAmoIds = new Set(batchLeads.map(l => l.id));
    const _batchTasksRaw = allTasks.filter(t => t.entity_type === 'leads' && batchAmoIds.has(t.entity_id) && !t.is_completed);
    // Dedup by task ID to prevent duplicate tasks if batch is re-run
    const { toCreate: _batchTasksFiltered, skipped: _batchTasksSkipped } = safety.filterNotMigrated('tasks_leads', _batchTasksRaw, t => t.id);
    const batchTasks = _batchTasksFiltered;

    if (batchTasks.length > 0) {
      updateState({ step: `Перенос задач (${batchTasks.length})...` });
      const { transformTask } = require('../utils/dataTransformer');
      // Build lead responsible_user_id map (AMO lead id → kommo user id)
      const leadKommoUserById = {};
      for (const lead of batchLeads) {
        const amoUid = lead.responsible_user_id;
        const kommoUid = amoUid ? (userMap[amoUid] || userMap[String(amoUid)]) : null;
        if (kommoUid) leadKommoUserById[lead.id] = Number(kommoUid);
      }
      const tasksToCreate = batchTasks.map(t => {
        const entityKommoUser = leadKommoUserById[t.entity_id] || null;
        const tt = transformTask(t, userMap, entityKommoUser);
        tt.entity_id = leadIdMap[t.entity_id];
        tt.entity_type = 'leads';
        tt._wasCompleted = !!t.is_completed;
        tt._amoTaskId = t.id;
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
        const _batchTaskPairs = [];
        const _completedBatchLeadTaskIds = [];
        created.forEach((k, idx) => {
          if (k) {
            batchState.createdIds.tasks.push(k.id);
            if (tasksToCreate[idx]?._wasCompleted) _completedBatchLeadTaskIds.push(k.id);
            if (tasksToCreate[idx]?._amoTaskId) _batchTaskPairs.push({ amoId: Number(tasksToCreate[idx]._amoTaskId), kommoId: k.id });
          }
        });
        if (_completedBatchLeadTaskIds.length > 0) await kommoApi.completeTasksBatch(_completedBatchLeadTaskIds);
        if (_batchTaskPairs.length > 0) safety.registerMigratedBatch('tasks_leads', _batchTaskPairs);
        const _ltSuccessCount = created.filter(x => x !== null).length;
        if (_ltSuccessCount < tasksToCreate.length) {
          logger.warn(`[batch] Задачи лидов: перенесено ${_ltSuccessCount}/${tasksToCreate.length}`);
          if (_ltSuccessCount === 0) addWarning('Задачи лидов: 0 перенесено после retry.', 'Попробуйте повтор пакета.');
        }
      } catch (e) {
        logger.error('[batch] Неожиданная ошибка задач лидов: ' + e.message);
      }
    }

    /* ── 10-fix. PATCH task_type_id + text for already-migrated lead tasks ──────── */
    if (!_skipPatch && _batchTasksSkipped.length > 0) {
      const { AMO_TO_KOMMO_TASK_TYPE, fmtDatePrefix: _fmtDP } = require('../utils/dataTransformer');
      const _taskTypeUpdates = [];
      for (const s of _batchTasksSkipped) {
        const amoTask = s.item;
        if (amoTask.is_completed) continue; // only active tasks
        const kommoTaskId = s.kommoId;
        const amoTypeId = amoTask.task_type_id;
        const kommoTypeId = AMO_TO_KOMMO_TASK_TYPE[amoTypeId];
        const upd = { id: kommoTaskId, task_type_id: kommoTypeId || 1 };
        // МОЯ ЗАДАЧА prefix for self-assigned tasks
        if (amoTask.created_by && amoTask.responsible_user_id && amoTask.created_by === amoTask.responsible_user_id) {
          const _tb = _fmtDP(amoTask.created_at) + ((amoTask.text && amoTask.text.trim()) ? amoTask.text : 'Задача');
          upd.text = 'МОЯ ЗАДАЧА: ' + _tb;
        }
        _taskTypeUpdates.push(upd);
      }
      if (_taskTypeUpdates.length > 0) {
        updateState({ step: `Обновление типов задач лидов (${_taskTypeUpdates.length})...` });
        try {
          const _updatedLT = await kommoApi.updateTasksBatch(_taskTypeUpdates);
          logger.info(`[batch] PATCH task_type_id for lead tasks: ${_updatedLT}/${_taskTypeUpdates.length}`);
        } catch (e) {
          logger.error('[batch] Ошибка PATCH типов задач лидов: ' + e.message);
        }
      } else {
        logger.info(`[batch] Skipped lead tasks: ${_batchTasksSkipped.length}, all type=1, no PATCH needed`);
      }
    }

    /* -- 10b. Batch: Contact tasks ----------------------------------------- */
    let _batchContactTasksSkipped = [];
    {
      const _batchContactIdsSet = new Set(Object.keys(contactIdMap).map(Number));
      const _batchContactTasksRaw = allTasks.filter(
        t => t.entity_type === 'contacts' && _batchContactIdsSet.has(Number(t.entity_id)) && !t.is_completed
      );
      const { toCreate: _batchContactTasksFiltered, skipped: _ctSkipped } = safety.filterNotMigrated('tasks_contacts', _batchContactTasksRaw, t => t.id);
      _batchContactTasksSkipped = _ctSkipped;
      if (_batchContactTasksFiltered.length > 0) {
        updateState({ step: 'Перенос задач контактов (' + _batchContactTasksFiltered.length + ')...' });
        const { transformTask: _transformTaskCT } = require('../utils/dataTransformer');
        const _ctKommoUserById = {};
        for (const contact of allContacts) {
          const uid = contact.responsible_user_id;
          const kuid = uid ? (userMap[uid] || userMap[String(uid)]) : null;
          if (kuid) _ctKommoUserById[contact.id] = Number(kuid);
        }
        const _ctTasksToCreate = _batchContactTasksFiltered.map(t => {
          const kContactId = contactIdMap[String(t.entity_id)];
          if (!kContactId) return null;
          const entityUser = _ctKommoUserById[t.entity_id] || null;
          const tt = _transformTaskCT(t, userMap, entityUser);
          tt.entity_id = Number(kContactId);
          tt.entity_type = 'contacts';
          tt._wasCompleted = !!t.is_completed;
          tt._amoTaskId = t.id;
          return tt;
        }).filter(Boolean);
        if (_ctTasksToCreate.length > 0) {
          try {
            const _createdCT = await kommoApi.createTasksBatch(_ctTasksToCreate);
            const _completedCTIds = [];
            const _ctPairs = [];
            _createdCT.forEach((k, idx) => {
              if (k) {
                batchState.createdIds.tasks.push(k.id);
                if (_ctTasksToCreate[idx]?._wasCompleted) _completedCTIds.push(k.id);
                if (_ctTasksToCreate[idx]?._amoTaskId) _ctPairs.push({ amoId: Number(_ctTasksToCreate[idx]._amoTaskId), kommoId: k.id });
              }
            });
            if (_completedCTIds.length > 0) await kommoApi.completeTasksBatch(_completedCTIds);
            if (_ctPairs.length > 0) safety.registerMigratedBatch('tasks_contacts', _ctPairs);
            const _ctSuccessCount = _createdCT.filter(x => x !== null).length;
            if (_ctSuccessCount < _ctTasksToCreate.length) {
              logger.warn(`[batch] Задачи контактов: перенесено ${_ctSuccessCount}/${_ctTasksToCreate.length}`);
              if (_ctSuccessCount === 0) addWarning('Задачи контактов: 0 перенесено после retry.', 'Попробуйте повтор пакета.');
            }
          } catch (e) {
            logger.error('[batch] Неожиданная ошибка задач контактов: ' + e.message);
          }
        }
      }
    }

    /* ── 10b-fix. PATCH task_type_id + text for already-migrated contact tasks ── */
    if (!_skipPatch && _batchContactTasksSkipped && _batchContactTasksSkipped.length > 0) {
      const { AMO_TO_KOMMO_TASK_TYPE: _ctTypeMap, fmtDatePrefix: _fmtDP2 } = require('../utils/dataTransformer');
      const _ctTypeUpdates = [];
      for (const s of _batchContactTasksSkipped) {
        const amoTask = s.item;
        if (amoTask.is_completed) continue; // only active tasks
        const amoTypeId = amoTask.task_type_id;
        const kommoTypeId = _ctTypeMap[amoTypeId];
        const upd = { id: s.kommoId, task_type_id: kommoTypeId || 1 };
        if (amoTask.created_by && amoTask.responsible_user_id && amoTask.created_by === amoTask.responsible_user_id) {
          const _tb = _fmtDP2(amoTask.created_at) + ((amoTask.text && amoTask.text.trim()) ? amoTask.text : 'Задача');
          upd.text = 'МОЯ ЗАДАЧА: ' + _tb;
        }
        _ctTypeUpdates.push(upd);
      }
      if (_ctTypeUpdates.length > 0) {
        try {
          const _ctUpd = await kommoApi.updateTasksBatch(_ctTypeUpdates);
          logger.info(`[batch] PATCH task_type_id for contact tasks: ${_ctUpd}/${_ctTypeUpdates.length}`);
        } catch (e) {
          logger.error('[batch] Ошибка PATCH типов задач контактов: ' + e.message);
        }
      }
    }

    /* -- 10c. Batch: Company tasks ----------------------------------------- */
    let _batchCompanyTasksSkipped = [];
    {
      const _batchCompanyIdsSet = new Set(Object.keys(companyIdMap).map(Number));
      const _batchCompanyTasksRaw = allTasks.filter(
        t => t.entity_type === 'companies' && _batchCompanyIdsSet.has(Number(t.entity_id)) && !t.is_completed
      );
      const { toCreate: _batchCompanyTasksFiltered, skipped: _coSkipped } = safety.filterNotMigrated('tasks_companies', _batchCompanyTasksRaw, t => t.id);
      _batchCompanyTasksSkipped = _coSkipped;
      if (_batchCompanyTasksFiltered.length > 0) {
        updateState({ step: 'Перенос задач компаний (' + _batchCompanyTasksFiltered.length + ')...' });
        const { transformTask: _transformTaskCo } = require('../utils/dataTransformer');
        const _coKommoUserById = {};
        for (const company of allCompanies) {
          const uid = company.responsible_user_id;
          const kuid = uid ? (userMap[uid] || userMap[String(uid)]) : null;
          if (kuid) _coKommoUserById[company.id] = Number(kuid);
        }
        const _coTasksToCreate = _batchCompanyTasksFiltered.map(t => {
          const kCompanyId = companyIdMap[String(t.entity_id)];
          if (!kCompanyId) return null;
          const entityUser = _coKommoUserById[t.entity_id] || null;
          const tt = _transformTaskCo(t, userMap, entityUser);
          tt.entity_id = Number(kCompanyId);
          tt.entity_type = 'companies';
          tt._wasCompleted = !!t.is_completed;
          tt._amoTaskId = t.id;
          return tt;
        }).filter(Boolean);
        if (_coTasksToCreate.length > 0) {
          try {
            const _createdCo = await kommoApi.createTasksBatch(_coTasksToCreate);
            const _completedCoIds = [];
            const _coPairs = [];
            _createdCo.forEach((k, idx) => {
              if (k) {
                batchState.createdIds.tasks.push(k.id);
                if (_coTasksToCreate[idx]?._wasCompleted) _completedCoIds.push(k.id);
                if (_coTasksToCreate[idx]?._amoTaskId) _coPairs.push({ amoId: Number(_coTasksToCreate[idx]._amoTaskId), kommoId: k.id });
              }
            });
            if (_completedCoIds.length > 0) await kommoApi.completeTasksBatch(_completedCoIds);
            if (_coPairs.length > 0) safety.registerMigratedBatch('tasks_companies', _coPairs);
          } catch (e) {
            addWarning('Ошибка переноса задач компаний: ' + e.message, 'Повторите пакет.');
          }
        }
      }
    }

    /* ── 10c-fix. PATCH task_type_id + text for already-migrated company tasks ── */
    if (!_skipPatch && _batchCompanyTasksSkipped && _batchCompanyTasksSkipped.length > 0) {
      const { AMO_TO_KOMMO_TASK_TYPE: _coTypeMap, fmtDatePrefix: _fmtDP3 } = require('../utils/dataTransformer');
      const _coTypeUpdates = [];
      for (const s of _batchCompanyTasksSkipped) {
        const amoTask = s.item;
        if (amoTask.is_completed) continue; // only active tasks
        const amoTypeId = amoTask.task_type_id;
        const kommoTypeId = _coTypeMap[amoTypeId];
        const upd = { id: s.kommoId, task_type_id: kommoTypeId || 1 };
        if (amoTask.created_by && amoTask.responsible_user_id && amoTask.created_by === amoTask.responsible_user_id) {
          const _tb = _fmtDP3(amoTask.created_at) + ((amoTask.text && amoTask.text.trim()) ? amoTask.text : 'Задача');
          upd.text = 'МОЯ ЗАДАЧА: ' + _tb;
        }
        _coTypeUpdates.push(upd);
      }
      if (_coTypeUpdates.length > 0) {
        try {
          const _coUpd = await kommoApi.updateTasksBatch(_coTypeUpdates);
          logger.info(`[batch] PATCH task_type_id for company tasks: ${_coUpd}/${_coTypeUpdates.length}`);
        } catch (e) {
          logger.error('[batch] Ошибка PATCH типов задач компаний: ' + e.message);
        }
      }
    }

    /* ── 11. Migrate notes / timeline (leads + contacts) ────────────────────────── */
    updateState({ step: 'Перенос комментариев сделок...' });
    {
      const leadAmoIds = batchLeads.map(l => l.id);
      try {
        const allLeadNotes = await amoApi.getLeadNotesByEntityIds(leadAmoIds);
        const _batchLeadNotesTyped = allLeadNotes.filter(note => !SKIP_NOTE_TYPES.has(note.note_type));
        const { toCreate: _batchLeadNotesToCreate } = safety.filterNotMigrated('notes_leads', _batchLeadNotesTyped, n => n.id);
        // Build flat array: all notes for all leads in one bulk call
        const _allLeadNotesMapped = [];
        const _allLeadNoteAmoIds = [];
        for (const note of _batchLeadNotesToCreate) {
          const kId = leadIdMap[note.entity_id];
          if (!kId) continue;
          const s = sanitizeNoteParams(note);
          _allLeadNotesMapped.push({ entity_id: Number(kId), note_type: s.note_type, params: s.params, created_by: 12739795 });
          _allLeadNoteAmoIds.push(note.id);
        }
        if (_allLeadNotesMapped.length > 0) {
          const created = await kommoApi.createNotesBatch('leads', _allLeadNotesMapped);
          const _batchLeadNotePairs = [];
          created.forEach((cn, idx) => {
            if (cn) {
              batchState.createdIds.notes.push(cn.id);
              if (_allLeadNoteAmoIds[idx]) _batchLeadNotePairs.push({ amoId: Number(_allLeadNoteAmoIds[idx]), kommoId: cn.id });
            }
          });
          if (_batchLeadNotePairs.length > 0) safety.registerMigratedBatch('notes_leads', _batchLeadNotePairs);
          const _leadSuccessCount = created.filter(x => x !== null).length;
          if (_leadSuccessCount < _allLeadNotesMapped.length) {
            logger.warn(`[batch] Заметки сделок: перенесено ${_leadSuccessCount}/${_allLeadNotesMapped.length}`);
          }
        }
      } catch (e) {
        addWarning('Не удалось загрузить заметки сделок: ' + e.message, 'Попробуйте повторить пакет.');
      }
    }

    updateState({ step: 'Перенос комментариев контактов...' });
    {
      // Collect unique contact IDs from this batch
      const batchContactAmoIds = [];
      const seenContactIds = new Set();
      for (const aLead of batchLeads) {
        for (const c of (aLead._embedded?.contacts || [])) {
          const aContactId = c.id;
          if (!contactIdMap[aContactId] || seenContactIds.has(aContactId)) continue;
          seenContactIds.add(aContactId);
          batchContactAmoIds.push(aContactId);
        }
      }
      try {
        // Bulk-fetch all contact notes in one API call (batches of 50 inside)
        const allContactNotes = await amoApi.getContactNotesByEntityIds(batchContactAmoIds);
        // Filter out skipped types + dedup via safety
        const _bCNotesTyped = allContactNotes.filter(note => !SKIP_NOTE_TYPES.has(note.note_type));
        const { toCreate: _bCNotesToCreate } = safety.filterNotMigrated('notes_contacts', _bCNotesTyped, n => n.id);
        // Group by kommo contact ID
        const _bCNotesGrouped = {};
        for (const note of _bCNotesToCreate) {
          const kId = contactIdMap[note.entity_id];
          if (!kId) continue;
          if (!_bCNotesGrouped[kId]) _bCNotesGrouped[kId] = [];
          _bCNotesGrouped[kId].push(note);
        }
        // Build flat array: all contact notes in one bulk call
        const _allContactNotesMapped = [];
        const _allContactNoteAmoIds = [];
        for (const [kId, notes] of Object.entries(_bCNotesGrouped)) {
          for (const note of notes) {
            const s = sanitizeNoteParams(note);
            _allContactNotesMapped.push({ entity_id: Number(kId), note_type: s.note_type, params: s.params, created_by: 12739795 });
            _allContactNoteAmoIds.push(note.id);
          }
        }
        if (_allContactNotesMapped.length > 0) {
          const created = await kommoApi.createNotesBatch('contacts', _allContactNotesMapped);
          const _batchContactNotePairs = [];
          created.forEach((cn, idx) => {
            if (cn) {
              batchState.createdIds.notes.push(cn.id);
              if (_allContactNoteAmoIds[idx]) _batchContactNotePairs.push({ amoId: Number(_allContactNoteAmoIds[idx]), kommoId: cn.id });
            }
          });
          if (_batchContactNotePairs.length > 0) safety.registerMigratedBatch('notes_contacts', _batchContactNotePairs);
          const _cSuccessCount = created.filter(x => x !== null).length;
          if (_cSuccessCount < _allContactNotesMapped.length) {
            logger.warn(`[batch] Заметки контактов: перенесено ${_cSuccessCount}/${_allContactNotesMapped.length}`);
          }
        }
      } catch (e) {
        addWarning('Не удалось загрузить заметки контактов: ' + e.message, 'Попробуйте повторить пакет.');
      }
    }

    /* ── 12. Update offset ──────────────────────────────────────────── */
    batchConfig.offset = from + batchLeads.length;
    batchState.stats.totalTransferred = batchConfig.offset;
    batchState.stats.remainingLeads   = Math.max(0, eligible.length - batchConfig.offset);
    // Save last batch position for retry feature
    batchState.lastBatch = { from, size: batchLeads.length };
    // Store AMO→Kommo deal pairs for verification UI
    batchState.dealPairs = Object.entries(leadIdMap).map(([amo, kommo]) => ({ amoId: Number(amo), kommoId: Number(kommo) }));
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

// ─── Single / selective deals transfer ───────────────────────────────────────
/**
 * Transfer a specific set of leads (by AMO id) from cache to Kommo.
 * Unlike runBatchMigration this is synchronous (returns result directly).
 * Notes are fetched live from AMO API just like the batch process.
 */
async function runSingleDealsTransfer(leadIds, stageMapping) {
  const idSet = new Set(leadIds.map(Number));
  const cache = loadAmoCache();

  const allLeads     = cache.leads     || [];
  const allContacts  = cache.contacts  || [];
  const allCompanies = cache.companies || [];
  // Support both old (tasks) and new (leadTasks/contactTasks) cache format
  const allTasks = [
    ...(cache.tasks || []),
    ...(cache.leadTasks || []),
    ...(cache.contactTasks || []),
    ...(cache.companyTasks || []),
  ];

  const selectedLeads = allLeads.filter(l => idSet.has(l.id));
  if (selectedLeads.length === 0) {
    throw new Error('Указанные сделки не найдены в кэше. Обновите данные AMO на вкладке "Данные AMO".');
  }

  const result = {
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
    tasksDetail: {
      leads:     { found: 0, created: 0 },
      contacts:  { found: 0, created: 0 },
      companies: { found: 0, created: 0 },
    },
  };

  const fieldMappings = loadFieldMapping() || { leads: null, contacts: null, companies: null };

  // --- Fix #4: Warn about leads whose stage is not in stageMapping ---
  if (stageMapping && Object.keys(stageMapping).length > 0) {
    const unmappedStages = new Set();
    selectedLeads.forEach(l => {
      if (l.status_id && !stageMapping[l.status_id] && ![142, 143].includes(l.status_id))
        unmappedStages.add(l.status_id);
    });
    if (unmappedStages.size > 0) {
      result.warnings.push(
        `Этапы [${[...unmappedStages].join(', ')}] отсутствуют в маппинге — сделки попадут в первый доступный этап Kommo. Выполните "Синхронизировать этапы" для создания недостающих этапов.`
      );
    }
  }

  // --- User mapping (AMO responsible_user_id → Kommo responsible_user_id) ---
  const userMap = {};
  try {
    const db = require('../db');
    const ums = db.getUserMappings ? db.getUserMappings() : [];
    ums.forEach(m => { userMap[m.amo_user_id] = m.kommo_user_id; userMap[String(m.amo_user_id)] = m.kommo_user_id; });
  } catch (e) { /* db not available — proceed without user mapping */ }

  // ── Companies ──────────────────────────────────────────────────────────────
  const neededCompanyIds = new Set(
    selectedLeads.flatMap(l => ((l._embedded && l._embedded.companies) || []).map(c => c.id))
  );
  const companyIdMap = {};
  const newCompanyAmoIds = new Set();
  if (neededCompanyIds.size > 0) {
    const companies = allCompanies.filter(c => neededCompanyIds.has(c.id));
    const { toCreate, skipped } = safety.filterNotMigrated('companies', companies, c => c.id);
    for (const { item, amoId, kommoId } of skipped) {
      companyIdMap[String(amoId)] = kommoId;
      result.skipped.companies++;
      // PATCH custom fields — может быть пропустили при первом переносе
      const { transformCompany: _tc } = require('../utils/dataTransformer');
      const tc = _tc(item, fieldMappings.companies, userMap);
      if (tc.custom_fields_values && tc.custom_fields_values.length > 0) {
        try { await kommoApi.updateCompany(kommoId, { custom_fields_values: tc.custom_fields_values }); }
        catch (e) { result.warnings.push(`Обновление кастомных полей компании AMO#${amoId}: ${e.message}`); }
      }
      // Determine Kommo user: from entity's own mapping, fallback to first configured mapping
      if (!tc.responsible_user_id && item.responsible_user_id) {
        const _fbUid = Object.keys(userMap).length > 0 ? Number(Object.values(userMap)[0]) : null;
        result.warnings.push(`Нет маппинга пользователя amo_id=${item.responsible_user_id} для компании AMO#${amoId}${_fbUid ? `, назначен kommo_id=${_fbUid}` : ', ответственный не назначен'}`);
      }
      const compKommoUserId = tc.responsible_user_id || (Object.keys(userMap).length > 0 ? Number(Object.values(userMap)[0]) : null);
      if (compKommoUserId) {
        try { await kommoApi.updateCompany(kommoId, { responsible_user_id: compKommoUserId }); }
        catch (e) { result.warnings.push(`Обновление менеджера компании AMO#${amoId}: ${e.message}`); }
      }
    }
    if (toCreate.length > 0) {
      try {
        const { transformCompany } = require('../utils/dataTransformer');
        const created = await kommoApi.createCompaniesBatch(
          toCreate.map(c => transformCompany(c, fieldMappings.companies, userMap))
        );
        const pairs = [];
        created.forEach((k, i) => {
          if (k && toCreate[i]) {
            companyIdMap[String(toCreate[i].id)] = k.id;
            result.createdIds.companies.push(k.id);
            result.transferred.companies++;
              newCompanyAmoIds.add(toCreate[i].id);
            pairs.push({ amoId: toCreate[i].id, kommoId: k.id });
          }
        });
        safety.registerMigratedBatch('companies', pairs);
      } catch (e) { result.errors.push('Компании: ' + e.message); }
    }
  }

  // ── Contacts ───────────────────────────────────────────────────────────────
  // Build contact→lead manager fallback (for contacts whose AMO user is not in userMap)
  const contactLeadManagerMapTransfer = {};
  for (const lead of selectedLeads) {
    const amoLeadUid = lead.responsible_user_id;
    const kommoLeadUid = amoLeadUid ? (userMap[amoLeadUid] || userMap[String(amoLeadUid)]) : null;
    if (kommoLeadUid) {
      for (const c of ((lead._embedded && lead._embedded.contacts) || [])) {
        if (!contactLeadManagerMapTransfer[c.id]) contactLeadManagerMapTransfer[c.id] = Number(kommoLeadUid);
      }
    }
  }

  const neededContactIds = new Set(
    selectedLeads.flatMap(l => ((l._embedded && l._embedded.contacts) || []).map(c => c.id))
  );
  const contactIdMap = {};
  const newContactAmoIds = new Set();
  if (neededContactIds.size > 0) {
    const contacts = allContacts.filter(c => neededContactIds.has(c.id));
    const { toCreate, skipped } = safety.filterNotMigrated('contacts', contacts, c => c.id);
    for (const { item, amoId, kommoId } of skipped) {
      contactIdMap[String(amoId)] = kommoId;
      result.skipped.contacts++;
      // PATCH custom fields — может быть пропустили при первом переносе
      const { transformContact: _tct } = require('../utils/dataTransformer');
      const tct = _tct(item, fieldMappings.contacts, userMap);
      if (tct.custom_fields_values && tct.custom_fields_values.length > 0) {
        try { await kommoApi.updateContact(kommoId, { custom_fields_values: tct.custom_fields_values }); }
        catch (e) { result.warnings.push(`Обновление кастомных полей контакта AMO#${amoId}: ${e.message}`); }
      }
      // Determine Kommo user: from entity's own mapping, fallback to first configured mapping
      if (!tct.responsible_user_id && item.responsible_user_id) {
        const _fbUid = Object.keys(userMap).length > 0 ? Number(Object.values(userMap)[0]) : null;
        result.warnings.push(`Нет маппинга пользователя amo_id=${item.responsible_user_id} для контакта AMO#${amoId}${_fbUid ? `, назначен kommo_id=${_fbUid}` : ', ответственный не назначен'}`);
      }
      const contKommoUserId = tct.responsible_user_id || (Object.keys(userMap).length > 0 ? Number(Object.values(userMap)[0]) : null);
      if (contKommoUserId) {
        try { await kommoApi.updateContact(kommoId, { responsible_user_id: contKommoUserId }); }
        catch (e) { result.warnings.push(`Обновление менеджера контакта AMO#${amoId}: ${e.message}`); }
      }
    }
    if (toCreate.length > 0) {
      try {
        const { transformContact } = require('../utils/dataTransformer');
        const created = await kommoApi.createContactsBatch(
          toCreate.map(c => transformContact(c, fieldMappings.contacts, userMap))
        );
        const pairs = [];
        created.forEach((k, i) => {
          if (k && toCreate[i]) {
            contactIdMap[String(toCreate[i].id)] = k.id;
            result.createdIds.contacts.push(k.id);
            result.transferred.contacts++;
              newContactAmoIds.add(toCreate[i].id);
            pairs.push({ amoId: toCreate[i].id, kommoId: k.id });
          }
        });
        safety.registerMigratedBatch('contacts', pairs);
      } catch (e) { result.errors.push('Контакты: ' + e.message); }
    }
  }

  // ── Leads ──────────────────────────────────────────────────────────────────
  const { toCreate: leadsToCreate, skipped: leadsSkipped } =
    safety.filterNotMigrated('leads', selectedLeads, l => l.id);
  const leadIdMap = {};
  const newLeadAmoIds = new Set();
  // Для уже перенесённых сделок — PATCH полей + повторная привязка
  for (const { item: aLead, amoId, kommoId } of leadsSkipped) {
    result.skipped.leads++;
    // Populate leadIdMap so notes section can find this lead
    leadIdMap[String(amoId)] = kommoId;
    // PATCH custom fields
    const { transformLead: _tl } = require('../utils/dataTransformer');
    const tl = _tl(aLead, stageMapping || {}, fieldMappings.leads, userMap);
    // PATCH custom fields separately from manager to avoid blocking manager update on field errors
    if (tl.custom_fields_values && tl.custom_fields_values.length > 0) {
      try { await kommoApi.updateLead(kommoId, { custom_fields_values: tl.custom_fields_values }); }
      catch (e) { result.warnings.push(`Обновление кастомных полей сделки AMO#${amoId}: ${e.message}`); }
    }
    // Always update responsible_user_id in separate PATCH — never blocked by custom field errors
    if (tl.responsible_user_id) {
      try { await kommoApi.updateLead(kommoId, { responsible_user_id: tl.responsible_user_id }); }
      catch (e) { result.warnings.push(`Обновление менеджера сделки AMO#${amoId}: ${e.message}`); }
    } else if (aLead.responsible_user_id) {
      const _fbUid = Object.keys(userMap).length > 0 ? Number(Object.values(userMap)[0]) : null;
      result.warnings.push(`Нет маппинга пользователя amo_id=${aLead.responsible_user_id} для сделки AMO#${amoId}${_fbUid ? `, назначен kommo_id=${_fbUid}` : ', ответственный не назначен'}`);
    }
    // Re-link contacts/companies (идемпотентно)
    for (const c of ((aLead._embedded && aLead._embedded.contacts) || [])) {
      const kId = contactIdMap[String(c.id)];
      if (kId) {
        try { await kommoApi.linkContactToLead(kommoId, kId); }
        catch (e) { result.warnings.push(`Привязка контакта #${c.id} к сделке AMO#${amoId}: ${e.message}`); }
      }
    }
    for (const c of ((aLead._embedded && aLead._embedded.companies) || [])) {
      const kId = companyIdMap[String(c.id)];
      if (kId) {
        try { await kommoApi.linkCompanyToLead(kommoId, kId); }
        catch (e) { result.warnings.push(`Привязка компании #${c.id} к сделке AMO#${amoId}: ${e.message}`); }
      }
    }
  }
    if (leadsToCreate.length > 0) {
      try {
        const { transformLead } = require('../utils/dataTransformer');
        const leadsForKommo = leadsToCreate.map(lead => {
          const t = transformLead(lead, stageMapping || {}, fieldMappings.leads, userMap);
          t.pipeline_id = (stageMapping && stageMapping._pipeline && stageMapping._pipeline.kommo) ? stageMapping._pipeline.kommo : config.kommo.pipelineId;
          // ── Передаём contacts и companies в _embedded при СОЗДАНИИ сделки ──
          // В Kommo API PATCH _embedded.contacts работает ненадёжно;
          // единственный гарантированный способ — включить их в POST /api/v4/leads
          const embContacts = [];
          const embCompanies = [];
          for (const c of ((lead._embedded && lead._embedded.contacts) || [])) {
            const kId = contactIdMap[String(c.id)];
            if (kId) {
              embContacts.push({ id: Number(kId) });
            } else {
              logger.warn(`Lead AMO#${lead.id}: контакт AMO#${c.id} не найден в contactIdMap — привязка пропущена`);
            }
          }
          for (const c of ((lead._embedded && lead._embedded.companies) || [])) {
            const kId = companyIdMap[String(c.id)];
            if (kId) {
              embCompanies.push({ id: Number(kId) });
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
            newLeadAmoIds.add(a.id);
          pairs.push({ amoId: a.id, kommoId: k.id });
          logger.info(`[transfer] Lead AMO#${a.id} → Kommo#${k.id}: contacts=${(a._embedded?.contacts||[]).length}, companies=${(a._embedded?.companies||[]).length}`);
        }
        safety.registerMigratedBatch('leads', pairs);
      } catch (e) { result.errors.push('Сделки: ' + e.message); }
    }

    // ── Tasks (from cache) ───────────────────────────────────────────────────────
    // Dedup: filter individual tasks by task ID (not by lead ID)
    // This ensures: if task creation failed on previous run, it will be retried
    const _allSelectedLeadIds = new Set(selectedLeads.map(l => l.id));
    const _allDealTasksRaw = allTasks.filter(
      t => t.entity_type === 'leads' && _allSelectedLeadIds.has(Number(t.entity_id))
    );
    const { toCreate: dealTasksFiltered } = safety.filterNotMigrated(
      'tasks_leads', _allDealTasksRaw, t => t.id);
    const dealTasks = dealTasksFiltered;
    logger.info(`[transfer] задач в кэше: ${dealTasks.length} (selectedLeads: ${selectedLeads.length}, leadIdMap keys: ${Object.keys(leadIdMap).length})`);
    result.tasksDetail.leads.found = dealTasks.length;
    if (dealTasks.length > 0) {
      try {
        const { transformTask } = require('../utils/dataTransformer');
        // Build lead kommo responsible user map
        const leadKommoUserTransfer = {};
        for (const lead of selectedLeads) {
          const uid = lead.responsible_user_id;
          const kuid = uid ? (userMap[uid] || userMap[String(uid)]) : null;
          const kLeadId = leadIdMap[String(lead.id)];
          if (kuid && kLeadId) leadKommoUserTransfer[Number(kLeadId)] = Number(kuid);
        }
        const tasksToCreate = dealTasks
          .map(t => {
            const kLeadId = Number(leadIdMap[String(t.entity_id)]);
            const entityUser = leadKommoUserTransfer[kLeadId] || null;
            const tt = transformTask(t, userMap, entityUser);
            tt.entity_id   = kLeadId;
            tt.entity_type = 'leads';
            tt._wasCompleted = !!t.is_completed;
            tt._amoTaskId = t.id; // track AMO id for per-task registration
            return tt;
          })
          .filter(t => t.entity_id);
        if (tasksToCreate.length < dealTasks.length) {
          const lost = dealTasks.length - tasksToCreate.length;
          result.warnings.push(lost + ' задач сделок потеряли привязку (сделка не создана в этом переносе).');
          logger.warn(`[transfer] ${lost} задач без entity_id в leadIdMap`);
        }
        logger.info(`[transfer] создаём ${tasksToCreate.length} задач сделок в Kommo`);
        const created = await kommoApi.createTasksBatch(tasksToCreate);
        logger.info(`[transfer] createTasksBatch(leads) вернул ${created.length} объектов`);
        const completedLeadTaskIds = [];
        const _taskPairsLeads = [];
        created.forEach((k, idx) => {
          if (k) {
            result.createdIds.tasks.push(k.id);
            result.transferred.tasks++;
            result.tasksDetail.leads.created++;
            if (tasksToCreate[idx]?._wasCompleted) completedLeadTaskIds.push(k.id);
            if (tasksToCreate[idx]?._amoTaskId) _taskPairsLeads.push({ amoId: Number(tasksToCreate[idx]._amoTaskId), kommoId: k.id });
          }
        });
        if (_taskPairsLeads.length > 0) {
          safety.registerMigratedBatch('tasks_leads', _taskPairsLeads);
          logger.info('[transfer] tasks_leads registered by task ID: ' + _taskPairsLeads.length);
        }
        if (completedLeadTaskIds.length > 0) {
          await kommoApi.completeTasksBatch(completedLeadTaskIds);
          logger.info('[transfer] выполненных задач сделок помечено: ' + completedLeadTaskIds.length);
        }
      } catch (e) {
        result.warnings.push('Задачи сделок: ' + e.message);
        logger.error('[transfer] ошибка задач сделок:', e.message);
      }
    }

    // ── Tasks: contact tasks (from cache) ────────────────────────────────────
      // Dedup: filter individual contact tasks by task ID (not by contact ID)
      const _allContactIdsSet = new Set(Object.keys(contactIdMap).map(Number));
      const _allContactTasksRaw = allTasks.filter(
        t => t.entity_type === 'contacts' && _allContactIdsSet.has(Number(t.entity_id))
      );
      const { toCreate: contactTasksFiltered } = safety.filterNotMigrated(
        'tasks_contacts', _allContactTasksRaw, t => t.id);
      const contactTasks = contactTasksFiltered;
    logger.info(`[transfer] задач контактов в кэше: ${contactTasks.length}`);
    result.tasksDetail.contacts.found = contactTasks.length;
    if (contactTasks.length > 0) {
      try {
        const { transformTask } = require('../utils/dataTransformer');
        // Build contact AMO-user → Kommo-user map for responsible assignment
        const contactKommoUserById = {};
        for (const contact of allContacts) {
          const uid = contact.responsible_user_id;
          const kuid = uid ? (userMap[uid] || userMap[String(uid)]) : null;
          if (kuid) contactKommoUserById[contact.id] = Number(kuid);
        }
        const tasksToCreate = contactTasks
          .map(t => {
            const kContactId = contactIdMap[String(t.entity_id)];
            if (!kContactId) return null;
            const entityUser = contactKommoUserById[t.entity_id] || null;
            const tt = transformTask(t, userMap, entityUser);
            tt.entity_id   = Number(kContactId);
            tt.entity_type = 'contacts';
            tt._wasCompleted = !!t.is_completed;
            tt._amoTaskId = t.id;
            return tt;
          })
          .filter(Boolean);
        if (tasksToCreate.length < contactTasks.length) {
          const lost = contactTasks.length - tasksToCreate.length;
          result.warnings.push(lost + ' задач контактов потеряли привязку (контакт не найден в contactIdMap).');
        }
        if (tasksToCreate.length > 0) {
          logger.info(`[transfer] создаём ${tasksToCreate.length} задач контактов в Kommo`);
          const created = await kommoApi.createTasksBatch(tasksToCreate);
          logger.info(`[transfer] createTasksBatch(contacts) вернул ${created.length} объектов`);
          const completedContactTaskIds = [];
          created.forEach((k, idx) => {
            if (k) {
              result.createdIds.tasks.push(k.id);
              result.transferred.tasks++;
              result.tasksDetail.contacts.created++;
              if (tasksToCreate[idx] && tasksToCreate[idx]._wasCompleted) completedContactTaskIds.push(k.id);
            }
          });
          if (completedContactTaskIds.length > 0) {
            await kommoApi.completeTasksBatch(completedContactTaskIds);
            logger.info('[transfer] выполненных задач контактов помечено: ' + completedContactTaskIds.length);
          }
          // Register contacts in id_mapping inside if-block (created is in scope here)
          const _taskPairsContacts = [];
          created.forEach((k, idx) => {
            if (k && tasksToCreate[idx]?._amoTaskId)
              _taskPairsContacts.push({ amoId: Number(tasksToCreate[idx]._amoTaskId), kommoId: k.id });
          });
          if (_taskPairsContacts.length > 0) {
            safety.registerMigratedBatch('tasks_contacts', _taskPairsContacts);
            logger.info('[transfer] tasks_contacts registered by task ID: ' + _taskPairsContacts.length);
          }
        }
      } catch (e) {
        result.warnings.push('Задачи контактов: ' + e.message);
        logger.error('[transfer] ошибка задач контактов:', e.message);
      }
    }

    // ── Tasks: company tasks (from cache) ──────────────────────────────────────────
      // Dedup: filter individual company tasks by task ID (not by company ID)
      const _allCompanyIdsSet = new Set(Object.keys(companyIdMap).map(Number));
      const _allCompanyTasksRaw = allTasks.filter(
        t => t.entity_type === 'companies' && _allCompanyIdsSet.has(Number(t.entity_id))
      );
      const { toCreate: companyTasksFiltered } = safety.filterNotMigrated(
        'tasks_companies', _allCompanyTasksRaw, t => t.id);
      const companyTasksToTransfer = companyTasksFiltered;
    logger.info(`[transfer] задач компаний в кэше: ${companyTasksToTransfer.length}`);
    result.tasksDetail.companies.found = companyTasksToTransfer.length;
    if (companyTasksToTransfer.length > 0) {
      try {
        const { transformTask } = require('../utils/dataTransformer');
        // Build company AMO-user → Kommo-user map for responsible assignment
        const companyKommoUserById = {};
        for (const company of allCompanies) {
          const uid = company.responsible_user_id;
          const kuid = uid ? (userMap[uid] || userMap[String(uid)]) : null;
          if (kuid) companyKommoUserById[company.id] = Number(kuid);
        }
        const tasksToCreate = companyTasksToTransfer
          .map(t => {
            const kCompanyId = companyIdMap[String(t.entity_id)];
            if (!kCompanyId) return null;
            const entityUser = companyKommoUserById[t.entity_id] || null;
            const tt = transformTask(t, userMap, entityUser);
            tt.entity_id   = Number(kCompanyId);
            tt.entity_type = 'companies';
            tt._wasCompleted = !!t.is_completed;
            tt._amoTaskId = t.id;
            return tt;
          })
          .filter(Boolean);
        if (tasksToCreate.length < companyTasksToTransfer.length) {
          const lost = companyTasksToTransfer.length - tasksToCreate.length;
          result.warnings.push(lost + ' задач компаний потеряли привязку (компания не найдена в companyIdMap).');
        }
        if (tasksToCreate.length > 0) {
          logger.info(`[transfer] создаём ${tasksToCreate.length} задач компаний в Kommo`);
          const created = await kommoApi.createTasksBatch(tasksToCreate);
          logger.info(`[transfer] createTasksBatch(companies) вернул ${created.length} объектов`);
          const completedCompanyTaskIds = [];
          created.forEach((k, idx) => {
            if (k) {
              result.createdIds.tasks.push(k.id);
              result.transferred.tasks++;
              result.tasksDetail.companies.created++;
              if (tasksToCreate[idx] && tasksToCreate[idx]._wasCompleted) completedCompanyTaskIds.push(k.id);
            }
          });
          if (completedCompanyTaskIds.length > 0) {
            await kommoApi.completeTasksBatch(completedCompanyTaskIds);
            logger.info('[transfer] выполненных задач компаний помечено: ' + completedCompanyTaskIds.length);
          }
          // Register companies in id_mapping inside if-block (created is in scope here)
          const _taskPairsCompanies = [];
          created.forEach((k, idx) => {
            if (k && tasksToCreate[idx]?._amoTaskId)
              _taskPairsCompanies.push({ amoId: Number(tasksToCreate[idx]._amoTaskId), kommoId: k.id });
          });
          if (_taskPairsCompanies.length > 0) {
            safety.registerMigratedBatch('tasks_companies', _taskPairsCompanies);
            logger.info('[transfer] tasks_companies registered by task ID: ' + _taskPairsCompanies.length);
          }
        }
      } catch (e) {
        result.warnings.push('Задачи компаний: ' + e.message);
        logger.error('[transfer] ошибка задач компаний:', e.message);
      }
    }

    // ── Notes: lead notes (batch fetch from AMO) ─────────────────────────────────────────
    {
      // Dedup by NOTE ID: fetch all lead notes, filter out already-migrated ones by note AMO ID
      const _allLeadNoteIds = selectedLeads.map(l => l.id);
      if (_allLeadNoteIds.length > 0) {
        try {
          const _allLeadNotesFetched = await amoApi.getLeadNotesByEntityIds(_allLeadNoteIds);
          logger.info(`[transfer] getLeadNotesByEntityIds: ${_allLeadNotesFetched.length} заметок для ${_allLeadNoteIds.length} сделок`);
          result.notesDetail.leads.fetched += _allLeadNotesFetched.length;
          // Filter by note type, then dedup by note ID
          const _leadNotesTyped = _allLeadNotesFetched.filter(n => !SKIP_NOTE_TYPES.has(n.note_type));
          const { toCreate: _leadNotesToCreate } = safety.filterNotMigrated('notes_leads', _leadNotesTyped, n => n.id);
          // Group by kommo lead ID for batch creation
          const _leadNotesGrouped = {};
          for (const note of _leadNotesToCreate) {
            const kId = leadIdMap[String(note.entity_id)];
            if (!kId) { logger.warn(`[transfer] notes(lead): нет kommo id для AMO lead#${note.entity_id}`); continue; }
            if (!_leadNotesGrouped[kId]) _leadNotesGrouped[kId] = [];
            _leadNotesGrouped[kId].push(note);
          }
          const _notePairsLeads = [];
          for (const [kId, notes] of Object.entries(_leadNotesGrouped)) {
            const amoNoteIds = notes.map(n => n.id);
            const notesData = notes.map(n => {
              const s = sanitizeNoteParams(n);
              return { entity_id: Number(kId), note_type: s.note_type, params: s.params, created_by: 12739795 };
            });
            try {
              const created = await kommoApi.createNotesBatch('leads', notesData);
              logger.info(`[transfer] createNotesBatch(leads) вернул ${created.length} объектов`);
              created.forEach((n, idx) => {
                if (n) {
                  result.createdIds.notes.push(n.id);
                  result.transferred.notes++;
                  result.notesDetail.leads.transferred++;
                  if (amoNoteIds[idx]) _notePairsLeads.push({ amoId: Number(amoNoteIds[idx]), kommoId: n.id });
                }
              });
            } catch (e) {
              const _amoLIdSingle = Object.entries(leadIdMap).find(([,v]) => v == kId)?.[0] || '?';
              result.warnings.push(`Заметки сделки Kommo#${kId} (AMO#${_amoLIdSingle}): ${e.message}`);
              logger.error(`[transfer] ошибка заметок kommo#${kId}:`, e.message);
            }
          }
          if (_notePairsLeads.length > 0) {
            safety.registerMigratedBatch('notes_leads', _notePairsLeads);
            logger.info('[transfer] notes_leads registered by note ID: ' + _notePairsLeads.length);
          }
        } catch (e) {
          result.warnings.push('Пакетная загрузка заметок сделок: ' + e.message);
          logger.error('[transfer] ошибка getLeadNotesByEntityIds:', e.message);
        }
      }
    }

  // ── Notes: contact notes (live fetch from AMO — индивидуальные заметки по контакту) ───────
  // Проходимся по всем контактам, связанным со сделками выборки
  const transferredContactIds = new Set();
  for (const aLead of selectedLeads) {
    for (const c of ((aLead._embedded && aLead._embedded.contacts) || [])) {
      const aContactId = c.id;
      const kContactId = contactIdMap[String(aContactId)];
      if (!kContactId || transferredContactIds.has(aContactId)) continue; // не дублируем
      transferredContactIds.add(aContactId);
      try {
        const _allContactNotes = await amoApi.getContactNotes(aContactId);
        result.notesDetail.contacts.fetched += _allContactNotes.length;
        // Dedup by note ID
        const _contactNotesTyped = _allContactNotes.filter(n => !SKIP_NOTE_TYPES.has(n.note_type));
        const { toCreate: _cNotesToCreate } = safety.filterNotMigrated('notes_contacts', _contactNotesTyped, n => n.id);
        if (_cNotesToCreate.length > 0) {
          const _cNoteAmoIds = _cNotesToCreate.map(n => n.id);
          const notesData = _cNotesToCreate.map(n => {
            const s = sanitizeNoteParams(n);
            return { entity_id: Number(kContactId), note_type: s.note_type, params: s.params, created_by: 12739795 };
          });
          const created = await kommoApi.createNotesBatch('contacts', notesData);
          const _cNotePairs = [];
          created.forEach((n, idx) => {
            if (n) {
              result.createdIds.notes.push(n.id);
              result.transferred.notes++;
              result.notesDetail.contacts.transferred++;
              if (_cNoteAmoIds[idx]) _cNotePairs.push({ amoId: Number(_cNoteAmoIds[idx]), kommoId: n.id });
            }
          });
          if (_cNotePairs.length > 0) safety.registerMigratedBatch('notes_contacts', _cNotePairs);
        }
      } catch (e) { result.warnings.push('Заметки контакта AMO#' + aContactId + ': ' + e.message); }
    }
  }

  // ── Notes: company notes (live fetch from AMO) ─────────────────────────────────
  const transferredCompanyIds = new Set();
  for (const aLead of selectedLeads) {
    for (const c of ((aLead._embedded && aLead._embedded.companies) || [])) {
      const aCompanyId = c.id;
      const kCompanyId = companyIdMap[String(aCompanyId)];
      if (!kCompanyId || transferredCompanyIds.has(aCompanyId)) continue;
      transferredCompanyIds.add(aCompanyId);
      try {
        const { notes: _allCompanyNotes } = await amoApi.getNotes('companies', aCompanyId);
        result.notesDetail.companies.fetched += _allCompanyNotes.length;
        // Dedup by note ID
        const _coNotesTyped = _allCompanyNotes.filter(n => !SKIP_NOTE_TYPES.has(n.note_type));
        const { toCreate: _coNotesToCreate } = safety.filterNotMigrated('notes_companies', _coNotesTyped, n => n.id);
        if (_coNotesToCreate.length > 0) {
          const _coNoteAmoIds = _coNotesToCreate.map(n => n.id);
          const notesData = _coNotesToCreate.map(n => {
            const s = sanitizeNoteParams(n);
            return { entity_id: Number(kCompanyId), note_type: s.note_type, params: s.params, created_by: 12739795 };
          });
          const created = await kommoApi.createNotesBatch('companies', notesData);
          const _coNotePairs = [];
          created.forEach((n, idx) => {
            if (n) {
              result.createdIds.notes.push(n.id);
              result.transferred.notes++;
              result.notesDetail.companies.transferred++;
              if (_coNoteAmoIds[idx]) _coNotePairs.push({ amoId: Number(_coNoteAmoIds[idx]), kommoId: n.id });
            }
          });
          if (_coNotePairs.length > 0) safety.registerMigratedBatch('notes_companies', _coNotePairs);
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
  return result;
}

function pauseBatch() {
  if (batchState.status !== 'running') throw new Error('Миграция не выполняется');
  pauseRequestedFlag = true;
  updateState({ step: '⏸ Запрос паузы...' });
  return { ok: true, message: 'Пауза будет применена на ближайшей контрольной точке' };
}

async function retryLastBatch() {
  if (batchState.status === 'running') throw new Error('Миграция уже выполняется');
  const last = batchState.lastBatch;
  if (!last || last.from === undefined) throw new Error('Нет данных о последнем пакете. Сначала выполните обычный перенос.');
  loadBatchConfig();
  batchConfig.offset = last.from;
  saveBatchConfig();
  logger.info('[retry] Retrying last batch from offset ' + last.from);
  const cfg2 = require('../config');
  const stagePath = path.resolve(cfg2.backupDir, 'stage_mapping.json');
  let stageMapping = {};
  if (fs.existsSync(stagePath)) stageMapping = fs.readJsonSync(stagePath);
  return runBatchMigration(stageMapping);
}

// ─── Auto-run cycle ───────────────────────────────────────────────────────────
/**
 * Starts an auto-run cycle: runs batches one after another with a 60-second
 * pause between them (to allow the user to review and press Stop).
 * The migration logic itself (runBatchMigration) is NOT changed.
 */
async function startAutoRun() {
  if (autoRunEnabled) throw new Error('Автозапуск уже работает');
  if (batchState.status === 'running') throw new Error('Пакетная миграция уже выполняется');

  autoRunEnabled = true;
  autoRunStopFlag = false;
  pauseRequestedFlag = false;
  logger.info('[auto-run] Auto-run cycle started, batchSize=' + batchConfig.batchSize);

  // Load stage mapping once
  const cfg2 = require('../config');
  const stagePath = path.resolve(cfg2.backupDir, 'stage_mapping.json');
  let stageMapping = {};
  if (fs.existsSync(stagePath)) stageMapping = fs.readJsonSync(stagePath);

  try {
    while (autoRunEnabled && !autoRunStopFlag) {
      loadBatchConfig();
      const cache = loadAmoCache();
      const eligible = getEligibleLeads(cache.leads || [], batchConfig.managerIds);
      const remaining = eligible.length - batchConfig.offset;

      if (remaining <= 0) {
        logger.info('[auto-run] All deals migrated. Stopping auto-run.');
        updateState({
          status: 'completed',
          step: `✅ Автозапуск завершён: все ${eligible.length} сделок перенесены`,
          completedAt: new Date().toISOString(),
        });
        break;
      }

      // ── Run one batch ──
      const offsetBefore = batchConfig.offset;
      await runBatchMigration(stageMapping);

      // ── Check result ──
      loadBatchConfig();
      const offsetAfter = batchConfig.offset;
      const transferred = offsetAfter - offsetBefore;
      const expectedSize = Math.min(batchConfig.batchSize || remaining, remaining);

      if (batchState.status === 'error') {
        logger.warn('[auto-run] Batch ended with error. Stopping auto-run.');
        autoRunEnabled = false;
        break;
      }

      if (batchState.status === 'paused') {
        logger.info('[auto-run] Batch was paused manually. Stopping auto-run.');
        autoRunEnabled = false;
        break;
      }

      // Counter verification: transferred must match expected batch size
      if (transferred !== expectedSize) {
        logger.warn(`[auto-run] Counter mismatch! Expected ${expectedSize}, got ${transferred}. Stopping.`);
        updateState({
          status: 'auto-stopped',
          step: `⚠️ Расхождение счётчиков: ожидалось ${expectedSize}, перенесено ${transferred}. Автозапуск остановлен.`,
          completedAt: new Date().toISOString(),
        });
        autoRunEnabled = false;
        break;
      }

      // Check if all done after this batch
      const remainingAfter = eligible.length - offsetAfter;
      if (remainingAfter <= 0) {
        logger.info('[auto-run] All deals migrated after this batch. Done.');
        updateState({
          status: 'completed',
          step: `✅ Автозапуск завершён: все ${eligible.length} сделок перенесены`,
          completedAt: new Date().toISOString(),
        });
        break;
      }

      // ── Wait for frontend to signal "continue" (client-side 60s countdown) ──
      logger.info(`[auto-run] Batch done (+${transferred}). Waiting for frontend continue signal. Remaining: ${remainingAfter}`);
      autoRunContinueFlag = false;
      updateState({
        status: 'auto-waiting',
        step: `⏳ Пауза перед следующим пакетом. Перенесено: ${offsetAfter}/${eligible.length}. Нажмите «Стоп» для отмены.`,
        autoRunCountdown: 60,
      });

      // Poll every 500ms for stop or continue signal (no heavy work — just flag checks)
      let stopped = false;
      while (!autoRunContinueFlag) {
        if (autoRunStopFlag || !autoRunEnabled) {
          stopped = true;
          break;
        }
        await new Promise(r => setTimeout(r, 500));
      }

      if (stopped || autoRunStopFlag || !autoRunEnabled) {
        logger.info('[auto-run] Stopped by user during countdown.');
        updateState({
          status: 'completed',
          step: `⏹ Автозапуск остановлен пользователем. Перенесено: ${offsetAfter}/${eligible.length}`,
          completedAt: new Date().toISOString(),
          autoRunCountdown: 0,
        });
        break;
      }
      logger.info('[auto-run] Continue signal received, starting next batch.');
    }
  } catch (err) {
    logger.error('[auto-run] Fatal error:', err);
    updateState({
      status: 'error',
      step: `❌ Автозапуск: критическая ошибка: ${err.message}`,
      completedAt: new Date().toISOString(),
    });
  } finally {
    autoRunEnabled = false;
    autoRunStopFlag = false;
    autoRunContinueFlag = false;
    batchState.autoRunCountdown = 0;
  }
}

function stopAutoRun() {
  if (!autoRunEnabled) {
    // Idempotent: double-click or stale state — just clean up flags
    pauseRequestedFlag = false;
    autoRunStopFlag = false;
    return { ok: true, wasRunning: false,
      transferred: batchState.stats?.totalTransferred || 0,
      remaining: batchState.stats?.remainingLeads || 0,
      lastStep: batchState.step || '' };
  }
  autoRunStopFlag = true;
  const wasRunning = batchState.status === 'running';
  if (wasRunning) {
    pauseRequestedFlag = true;
  }
  logger.info('[auto-run] Stop requested by user, wasRunning=' + wasRunning);
  return { ok: true, wasRunning,
    transferred: batchState.stats?.totalTransferred || 0,
    remaining: batchState.stats?.remainingLeads || 0,
    lastStep: batchState.step || '' };
}

function isAutoRunActive() {
  return autoRunEnabled;
}
  // ─── Continue auto-run (called by frontend after client-side countdown) ─────
  function continueAutoRun() {
    if (!autoRunEnabled) {
      return { ok: false, error: 'Автозапуск не активен' };
    }
    if (batchState.status !== 'auto-waiting') {
      return { ok: false, error: 'Не в состоянии ожидания' };
    }
    autoRunContinueFlag = true;
    logger.info('[auto-run] Continue signal received from frontend.');
    return { ok: true };
  }



module.exports = { getBatchConfig, setBatchConfig, getBatchState, analyzeManagers, getStats, runBatchMigration, rollbackBatch, resetOffset, loadBatchConfig, loadAmoCache, runSingleDealsTransfer, pauseBatch, retryLastBatch, startAutoRun, stopAutoRun,
    continueAutoRun, isAutoRunActive };
