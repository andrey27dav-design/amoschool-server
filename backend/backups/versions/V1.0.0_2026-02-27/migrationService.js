const amoApi = require('./amoApi');
const kommoApi = require('./kommoApi');
const backupService = require('./backupService');
const { transformLead, transformContact, transformCompany, transformTask, buildStageMapping, AMO_STAGE_MAP } = require('../utils/dataTransformer');
const config = require('../config');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const STAGE_MAPPING_PATH = path.join(__dirname, '../../backups/stage_mapping.json');
const safety = require('../utils/safetyGuard');

// AMO pipeline stages with their Russian names (known from API call)
const AMO_STAGES_ORDERED = [
  { id: 34305358, name: 'Разобранное', sort: 10 },
  { id: 43874146, name: 'Назначение', sort: 20 },
  { id: 69395438, name: 'Распределение', sort: 30 },
  { id: 34305361, name: 'Взять в работу', sort: 40 },
  { id: 82359846, name: 'Были на связи', sort: 50 },
  { id: 44960335, name: 'Клиент классифицирован', sort: 60 },
  { id: 34486387, name: 'Дано Пробное', sort: 70 },
  { id: 34336828, name: 'Доведено Пробное', sort: 80 },
  { id: 82359850, name: 'Предложение сделано', sort: 90 },
  { id: 82359854, name: 'Потенциал на сделку', sort: 100 },
  { id: 34506946, name: 'Счет выставлен', sort: 110 },
  { id: 34305370, name: 'Оплата', sort: 120 },
];

// Migration state (in-memory, can be persisted to file)
let migrationState = {
  status: 'idle', // idle | running | completed | error | rolling_back
  step: null,
  steps: [],
  progress: { current: 0, total: 0 },
  errors: [],
  warnings: [],
  createdIds: {
    contacts: [],
    companies: [],
    leads: [],
    tasks: [],
    notes: [],
  },
  stageMapping: {},
  backupPath: null,
  startedAt: null,
  completedAt: null,
};

// Load persisted stageMapping from disk if available
(function loadStageMappingFromDisk() {
  try {
    if (fs.existsSync(STAGE_MAPPING_PATH)) {
      const saved = JSON.parse(fs.readFileSync(STAGE_MAPPING_PATH, 'utf8'));
      migrationState.stageMapping = saved;
      logger.info('Stage mapping loaded from disk:', Object.keys(saved).length, 'entries');
    }
  } catch (e) {
    logger.warn('Could not load stage mapping from disk:', e.message);
  }
})();

function getState() {
  return { ...migrationState };
}

function updateState(updates) {
  migrationState = { ...migrationState, ...updates };
}

function addError(error) {
  migrationState.errors.push({
    timestamp: new Date().toISOString(),
    message: error.message || String(error),
    stack: error.stack,
  });
}

function addWarning(msg) {
  migrationState.warnings.push({ timestamp: new Date().toISOString(), message: msg });
}

function setStep(step, total = null) {
  migrationState.step = step;
  if (total !== null) migrationState.progress.total = total;
  logger.info(`Migration step: ${step}`);
}

function incrementProgress(n = 1) {
  migrationState.progress.current += n;
}

/**
 * Step 1: Sync pipeline stages in Kommo to match AMO.
 * @param {number|null} amoPipelineId  - override amo pipeline (default: config)
 * @param {number|null} kommoPipelineId - override kommo pipeline (default: config)
 * @returns {{ stageMapping, amoPipeline, kommoPipeline, created, skipped }}
 */
async function syncPipelineStages(amoPipelineId, kommoPipelineId) {
  setStep('Синхронизация этапов воронки');

  const amoId   = amoPipelineId   || config.amo.pipelineId;
  const kommoId = kommoPipelineId || config.kommo.pipelineId;

  // Fetch amo stages dynamically from the selected pipeline
  let amoStages;
  try {
    const amoPipeline = await amoApi.getPipeline(amoId);
    amoStages = (amoPipeline._embedded?.statuses || [])
      .filter(s => s.id !== 142 && s.id !== 143)   // exclude won/lost
      .sort((a, b) => a.sort - b.sort);
  } catch (e) {
    logger.warn(`Could not fetch amo pipeline ${amoId} dynamically, falling back to hardcoded list: ${e.message}`);
    amoStages = AMO_STAGES_ORDERED;
  }

  const kommoStagesBefore = await kommoApi.getPipelineStatuses(kommoId);
  const existingNames = new Set(kommoStagesBefore.map((s) => s.name.toLowerCase().trim()));

  // Use AMO stage colors directly — they are the same valid color set as Kommo
  // For sort: use max existing user sort + 10 per new stage to avoid conflicts
  const existingUserSorts = kommoStagesBefore
    .filter(s => s.sort < 9000) // exclude system win/lost stages
    .map(s => s.sort);
  let nextSort = existingUserSorts.length > 0 ? Math.max(...existingUserSorts) + 10 : 20;

  const newStages = [];
  const skipped = [];
  amoStages.forEach((stage) => {
    const nameLow = stage.name.toLowerCase().trim();
    if (!existingNames.has(nameLow)) {
      newStages.push({
        name: stage.name,
        sort: nextSort,
        color: stage.color || '#fffeb2',   // use AMO color — guaranteed valid
      });
      nextSort += 10;
    } else {
      skipped.push(stage.name);
    }
  });

  let freshlyCreated = [];
  if (newStages.length > 0) {
    logger.info(`Creating ${newStages.length} new stages in Kommo pipeline ${kommoId}`);
    freshlyCreated = await kommoApi.syncPipelineStages(kommoId, newStages);
  }

  // Re-fetch updated Kommo stages (Kommo may cache, so also use freshlyCreated)
  const updatedKommoStages = await kommoApi.getPipelineStatuses(kommoId);

  // Merge re-fetched + freshly created (in case Kommo API returns cached/stale list)
  const allKommoStages = [...updatedKommoStages];
  for (const cs of freshlyCreated) {
    if (cs && cs.id && !allKommoStages.find(s => s.id === cs.id)) {
      allKommoStages.push(cs);
    }
  }

  // Build mapping: AMO stage ID -> Kommo stage ID
  const stageMapping = {};
  const kommoByName = {};
  allKommoStages.forEach((s) => { kommoByName[s.name.toLowerCase().trim()] = s.id; });

  amoStages.forEach((amoStage) => {
    const name = amoStage.name.toLowerCase().trim();
    if (kommoByName[name]) stageMapping[amoStage.id] = kommoByName[name];
  });

  // Fallback: map won/lost
  stageMapping[142] = 142;
  stageMapping[143] = 143;

  updateState({ stageMapping });
  // Persist stageMapping to disk so it survives restarts
  try {
    fs.writeFileSync(STAGE_MAPPING_PATH, JSON.stringify(stageMapping, null, 2));
    logger.info('Stage mapping saved to disk:', STAGE_MAPPING_PATH);
  } catch (e) {
    logger.warn('Could not save stage mapping to disk:', e.message);
  }
  logger.info('Stage mapping built:', stageMapping);

  // Fetch amo pipeline info for comparison response
  let amoPipelineInfo = null;
  try {
    const raw = await amoApi.getPipeline(amoId);
    amoPipelineInfo = {
      id: raw.id,
      name: raw.name,
      statuses: (raw._embedded?.statuses || []).sort((a, b) => a.sort - b.sort),
    };
  } catch {}

  return {
    stageMapping,
    created: newStages.map(s => s.name),
    skipped,
    amoPipeline: amoPipelineInfo,
    kommoPipeline: {
      id: kommoId,
      statuses: allKommoStages.sort((a, b) => a.sort - b.sort),
    },
  };
}

/**
 * Step 2: Backup all AMO data
 */
async function backupAmoData() {
  setStep('Создание резервной копии данных amo CRM');

  logger.info('Fetching all AMO data for backup...');
  const [leads, contacts, companies, tasks, pipeline] = await Promise.all([
    amoApi.getAllLeads(config.amo.pipelineId),
    amoApi.getAllContacts(),
    amoApi.getAllCompanies(),
    amoApi.getAllTasks(),
    amoApi.getPipeline(config.amo.pipelineId),
  ]);

  const { filePath, stats } = await backupService.createFullBackup({ leads, contacts, companies, tasks, pipeline });
  updateState({ backupPath: filePath });

  logger.info('Backup completed:', stats);
  return { leads, contacts, companies, tasks, filePath };
}

/**
 * Step 3: Migrate companies
 */
async function migrateCompanies(amoCompanies) {
  setStep('Перенос компаний', amoCompanies.length);
  const idMap = {}; // amoId -> kommoId

  // ═ SAFETY: пропускаем уже перенесённые компании ════════════════════
  const { toCreate: companiesToCreate, skipped: companiesSkipped } =
    safety.filterNotMigrated('companies', amoCompanies, c => c.id);
  if (companiesSkipped.length > 0) {
    addWarning(`▶️ ${companiesSkipped.length} компаний уже перенесены — пропущены (перезапись запрещена).`);
    companiesSkipped.forEach(({ amoId, kommoId }) => { idMap[amoId] = kommoId; });
  }

  if (companiesToCreate.length > 0) {
    const toCreate = companiesToCreate.map((c) => transformCompany(c));
    const created = await kommoApi.createCompaniesBatch(toCreate);
    const pairs = [];
    created.forEach((kommo, idx) => {
      if (kommo && companiesToCreate[idx]) {
        idMap[companiesToCreate[idx].id] = kommo.id;
        migrationState.createdIds.companies.push(kommo.id);
        pairs.push({ amoId: companiesToCreate[idx].id, kommoId: kommo.id });
      }
      incrementProgress();
    });
    safety.registerMigratedBatch('companies', pairs);
    logger.info(`Companies migrated: ${created.length}/${amoCompanies.length} (skipped: ${companiesSkipped.length})`);
  }
  return idMap;
}

/**
 * Step 4: Migrate contacts
 */
async function migrateContacts(amoContacts) {
  setStep('Перенос контактов', amoContacts.length);
  const idMap = {};

  // ═ SAFETY: пропускаем уже перенесённые контакты ════════════════════
  const { toCreate: contactsToCreate, skipped: contactsSkipped } =
    safety.filterNotMigrated('contacts', amoContacts, c => c.id);
  if (contactsSkipped.length > 0) {
    addWarning(`▶️ ${contactsSkipped.length} контактов уже перенесены — пропущены (перезапись запрещена).`);
    contactsSkipped.forEach(({ amoId, kommoId }) => { idMap[amoId] = kommoId; });
  }

  if (contactsToCreate.length > 0) {
    const toCreate = contactsToCreate.map((c) => transformContact(c));
    const created = await kommoApi.createContactsBatch(toCreate);
    const pairs = [];
    created.forEach((kommo, idx) => {
      if (kommo && contactsToCreate[idx]) {
        idMap[contactsToCreate[idx].id] = kommo.id;
        migrationState.createdIds.contacts.push(kommo.id);
        pairs.push({ amoId: contactsToCreate[idx].id, kommoId: kommo.id });
      }
      incrementProgress();
    });
    safety.registerMigratedBatch('contacts', pairs);
    logger.info(`Contacts migrated: ${created.length}/${amoContacts.length} (skipped: ${contactsSkipped.length})`);
  }
  return idMap;
}

/**
 * Step 5: Migrate leads with links
 */
async function migrateLeads(amoLeads, contactIdMap, companyIdMap) {
  setStep('Перенос сделок', amoLeads.length);
  const idMap = {};

  // ═ SAFETY: пропускаем уже перенесённые сделки ══════════════════════
  const { toCreate: leadsToCreate, skipped: leadsSkipped } =
    safety.filterNotMigrated('leads', amoLeads, l => l.id);
  if (leadsSkipped.length > 0) {
    addWarning(`▶️ ${leadsSkipped.length} сделок уже перенесены — пропущены (перезапись запрещена).`);
    leadsSkipped.forEach(({ amoId, kommoId }) => { idMap[amoId] = kommoId; });
  }

  const toCreate = leadsToCreate.map((lead) => {
    const transformed = transformLead(lead, migrationState.stageMapping);
    transformed.pipeline_id = config.kommo.pipelineId;
    return transformed;
  });

  const created = leadsToCreate.length > 0 ? await kommoApi.createLeadsBatch(toCreate) : [];
  const leadPairs = [];

  // Link contacts and companies
  for (let idx = 0; idx < created.length; idx++) {
    const kommoLead = created[idx];
    const amoLead = leadsToCreate[idx];
    if (!kommoLead) continue;

    idMap[amoLead.id] = kommoLead.id;
    migrationState.createdIds.leads.push(kommoLead.id);
    leadPairs.push({ amoId: amoLead.id, kommoId: kommoLead.id });

    // Link contacts
    const amoContactIds = amoLead._embedded?.contacts?.map((c) => c.id) || [];
    for (const amoContactId of amoContactIds) {
      const kommoContactId = contactIdMap[amoContactId];
      if (kommoContactId) {
        try {
          await kommoApi.linkContactToLead(kommoLead.id, kommoContactId);
        } catch (e) {
          addWarning(`Could not link contact ${kommoContactId} to lead ${kommoLead.id}: ${e.message}`);
        }
      }
    }

    // Link companies
    const amoCompanyIds = amoLead._embedded?.companies?.map((c) => c.id) || [];
    for (const amoCompanyId of amoCompanyIds) {
      const kommoCompanyId = companyIdMap[amoCompanyId];
      if (kommoCompanyId) {
        try {
          await kommoApi.linkCompanyToLead(kommoLead.id, kommoCompanyId);
        } catch (e) {
          addWarning(`Could not link company ${kommoCompanyId} to lead ${kommoLead.id}: ${e.message}`);
        }
      }
    }

    incrementProgress();
  }

  if (leadPairs.length > 0) safety.registerMigratedBatch('leads', leadPairs);
  logger.info(`Leads migrated: ${created.length}/${amoLeads.length} (skipped: ${leadsSkipped.length})`);
  return idMap;
}

/**
 * Step 6: Migrate tasks
 */
async function migrateTasks(amoTasks, leadIdMap, contactIdMap) {
  setStep('Перенос задач', amoTasks.length);

  const toCreate = amoTasks.map((task) => {
    const t = transformTask(task);
    // Map entity IDs
    if (task.entity_type === 'leads') {
      t.entity_id = leadIdMap[task.entity_id];
      t.entity_type = 'leads';
    } else if (task.entity_type === 'contacts') {
      t.entity_id = contactIdMap[task.entity_id];
      t.entity_type = 'contacts';
    }
    return t;
  }).filter((t) => t.entity_id); // only tasks with mapped entities

  const created = await kommoApi.createTasksBatch(toCreate);
  created.forEach((k) => {
    if (k) migrationState.createdIds.tasks.push(k.id);
    incrementProgress();
  });

  logger.info(`Tasks migrated: ${created.length}/${amoTasks.length}`);
  return created;
}

/**
 * Step 7: Migrate notes/timeline for leads
 */
async function migrateNotes(amoLeads, leadIdMap) {
  setStep('Перенос таймлайна и комментариев', amoLeads.length);

  for (const amoLead of amoLeads) {
    const kommoLeadId = leadIdMap[amoLead.id];
    if (!kommoLeadId) { incrementProgress(); continue; }

    try {
      const notes = await amoApi.getLeadNotes(amoLead.id);

      if (notes.length > 0) {
        const toCreate = notes.map((note) => ({
          entity_id: kommoLeadId,
          note_type: note.note_type || 'common',
          params: note.params || {},
          created_at: note.created_at,
        }));

        const created = await kommoApi.createNotesBatch('leads', toCreate);
        created.forEach((n) => { if (n) migrationState.createdIds.notes.push(n.id); });
      }
    } catch (e) {
      addWarning(`Could not migrate notes for lead ${amoLead.id}: ${e.message}`);
    }

    incrementProgress();
  }
}

/**
 * Rollback: delete all created entities in Kommo
 */
async function rollback(steps = null) {
  updateState({ status: 'rolling_back' });
  logger.warn('Starting rollback...');

  const ids = migrationState.createdIds;

  try {
    if (!steps || steps.includes('leads')) {
      await kommoApi.deleteLeadsBatch(ids.leads);
      migrationState.createdIds.leads = [];
    }
    if (!steps || steps.includes('contacts')) {
      await kommoApi.deleteContactsBatch(ids.contacts);
      migrationState.createdIds.contacts = [];
    }
    if (!steps || steps.includes('companies')) {
      await kommoApi.deleteCompaniesBatch(ids.companies);
      migrationState.createdIds.companies = [];
    }

    updateState({ status: 'idle', step: null });
    logger.info('Rollback completed successfully');
  } catch (e) {
    addError(e);
    logger.error('Rollback failed:', e);
    updateState({ status: 'error' });
  }
}

/**
 * Full migration run
 */
async function runMigration() {
  if (migrationState.status === 'running') {
    throw new Error('Migration is already running');
  }

  updateState({
    status: 'running',
    step: 'Инициализация',
    errors: [],
    warnings: [],
    progress: { current: 0, total: 0 },
    createdIds: { contacts: [], companies: [], leads: [], tasks: [], notes: [] },
    startedAt: new Date().toISOString(),
    completedAt: null,
  });

  try {
    // Step 1: Sync pipeline stages
    await syncPipelineStages();

    // Step 2: Backup
    const { leads, contacts, companies, tasks } = await backupAmoData();

    // Step 3: Migrate companies
    const companyIdMap = await migrateCompanies(companies);

    // Step 4: Migrate contacts
    const contactIdMap = await migrateContacts(contacts);

    // Step 5: Migrate leads
    const leadIdMap = await migrateLeads(leads, contactIdMap, companyIdMap);

    // Step 6: Migrate tasks
    await migrateTasks(tasks, leadIdMap, contactIdMap);

    // Step 7: Migrate notes/timeline
    await migrateNotes(leads, leadIdMap);

    updateState({
      status: 'completed',
      step: 'Завершено',
      completedAt: new Date().toISOString(),
    });

    logger.info('Migration completed successfully!');
  } catch (e) {
    addError(e);
    logger.error('Migration failed:', e);
    updateState({ status: 'error' });
    throw e;
  }
}

module.exports = {
  getState,
  runMigration,
  rollback,
  syncPipelineStages,
  AMO_STAGES_ORDERED,
};
