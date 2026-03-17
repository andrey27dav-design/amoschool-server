// Generate kommo-structure.json — full mapping of pipelines, stages, fields, managers
// between AMO CRM and Kommo CRM, based on existing project data
const fs = require('fs-extra');
const path = require('path');
const Database = require('better-sqlite3');

const BACKUP_DIR = path.resolve(__dirname, '../backups');
const DB_PATH = path.resolve(__dirname, '../../backups/migration.db');

// 1. Load stage mapping
const stageMapping = fs.readJsonSync(path.join(BACKUP_DIR, 'stage_mapping.json'));

// 2. Load field mapping
const fieldMapping = fs.readJsonSync(path.join(BACKUP_DIR, 'field_mapping.json'));

// 3. Load user mapping from SQLite
let userMappings = [];
try {
  const db = new Database(DB_PATH, { readonly: true });
  userMappings = db.prepare('SELECT * FROM user_mapping').all();
  db.close();
} catch (e) {
  console.warn('Could not read user_mapping from DB:', e.message);
}

// 4. Load pipeline selection from SQLite
let pipelineSelection = [];
try {
  const db = new Database(DB_PATH, { readonly: true });
  pipelineSelection = db.prepare('SELECT * FROM pipeline_selection').all();
  db.close();
} catch (e) {
  console.warn('Could not read pipeline_selection from DB:', e.message);
}

// 5. Load AMO cache for pipeline/stage names
let amoCache = {};
try {
  amoCache = fs.readJsonSync(path.join(BACKUP_DIR, 'amo_data_cache.json'));
} catch (e) {
  console.warn('Could not read amo_data_cache:', e.message);
}

// 6. Load batch config
let batchConfig = {};
try {
  batchConfig = fs.readJsonSync(path.join(BACKUP_DIR, 'batch_config.json'));
} catch (e) {}

// 7. Load migration index stats
let migrationIndex = {};
try {
  migrationIndex = fs.readJsonSync(path.join(BACKUP_DIR, 'migration_index.json'));
} catch (e) {
  console.warn('Could not read migration_index:', e.message);
}

// === Build the structure ===

const pipeline = stageMapping._pipeline || {};

// Build stage list with names from AMO cache
const stages = [];
for (const [amoId, kommoId] of Object.entries(stageMapping)) {
  if (amoId === '_pipeline') continue;
  // Try to find stage name from AMO cache
  let amoName = `stage_${amoId}`;
  if (amoCache.pipelines) {
    for (const p of amoCache.pipelines) {
      if (p._embedded?.statuses) {
        const found = p._embedded.statuses.find(s => String(s.id) === String(amoId));
        if (found) { amoName = found.name; break; }
      }
    }
  }
  stages.push({
    amo_stage_id: Number(amoId),
    kommo_stage_id: Number(kommoId),
    amo_stage_name: amoName,
  });
}

// Build field mapping summary
const fieldsSummary = {};
for (const [entityType, mappings] of Object.entries(fieldMapping)) {
  if (!Array.isArray(mappings)) continue;
  fieldsSummary[entityType] = mappings.map(m => ({
    amo_field_id: m.amo_id,
    amo_field_name: m.amo_name,
    amo_field_type: m.amo_type,
    kommo_field_id: m.kommo_id,
    kommo_field_name: m.kommo_name,
    kommo_field_type: m.kommo_type,
    mapped: m.mapped !== false,
  }));
}

// Build user/manager mapping
const managers = userMappings.map(u => ({
  amo_user_id: u.amo_user_id,
  amo_user_name: u.amo_user_name || null,
  kommo_user_id: u.kommo_user_id,
  kommo_user_name: u.kommo_user_name || null,
}));

// Migration stats from index
const indexStats = {};
if (migrationIndex) {
  for (const [type, items] of Object.entries(migrationIndex)) {
    if (typeof items === 'object' && items !== null && !Array.isArray(items)) {
      indexStats[type] = Object.keys(items).length;
    }
  }
}

// === Compose final structure ===
const structure = {
  _meta: {
    generated: new Date().toISOString(),
    version: 'V1.6.25',
    description: 'Full mapping structure between AMO CRM and Kommo CRM for robot/automation migration',
  },
  pipeline: {
    amo_pipeline_id: pipeline.amo,
    amo_pipeline_name: 'ШКОЛА/РЕПЕТИТОРСТВО',
    kommo_pipeline_id: pipeline.kommo,
    kommo_pipeline_name: 'RUSSIANLANGUAGE DEPARTMENT',
  },
  stages,
  fields: fieldsSummary,
  managers,
  batch_config: {
    offset: batchConfig.offset,
    batchSize: batchConfig.batchSize,
  },
  migration_stats: indexStats,
};

const outPath = path.join(BACKUP_DIR, 'kommo-structure.json');
fs.writeJsonSync(outPath, structure, { spaces: 2 });
console.log('OK: kommo-structure.json created at', outPath);
console.log('Stages:', stages.length);
console.log('Field entities:', Object.keys(fieldsSummary).join(', '));
console.log('Managers:', managers.length);
console.log('Migration index entries:', JSON.stringify(indexStats));
