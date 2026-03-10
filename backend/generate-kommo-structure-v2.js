/**
 * generate-kommo-structure-v2.js
 * 
 * Generates a comprehensive kommo-structure.json containing:
 * - All pipeline mappings (AMO → Kommo)
 * - All stage mappings per pipeline pair
 * - Field mappings (leads, contacts, companies)
 * - Manager/user mappings
 * 
 * Run from: /var/www/amoschool/backend/
 * Usage: node generate-kommo-structure-v2.js
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Paths
const DB_PATH = path.join(__dirname, '..', 'backups', 'migration.db');
const FIELD_MAPPING_PATH = path.join(__dirname, 'backups', 'field_mapping.json');
const OUTPUT_PATH = path.join(__dirname, 'backups', 'kommo-structure.json');

console.log('=== Kommo Structure Generator v2 ===');
console.log('DB:', DB_PATH);
console.log('Fields:', FIELD_MAPPING_PATH);
console.log('Output:', OUTPUT_PATH);

// --- Read SQLite ---
const db = new Database(DB_PATH, { readonly: true });

// 1. Pipeline selections
const pipelineRows = db.prepare('SELECT * FROM pipeline_selection ORDER BY amo_pipeline_id').all();
console.log(`\nPipeline selections: ${pipelineRows.length}`);

// 2. Stage mappings
const stageRows = db.prepare('SELECT * FROM stage_mapping ORDER BY amo_pipeline_id, id').all();
console.log(`Stage mappings: ${stageRows.length}`);

// 3. User mappings
const userRows = db.prepare('SELECT * FROM user_mapping ORDER BY id').all();
console.log(`User mappings: ${userRows.length}`);

db.close();

// --- Read field mapping ---
let fieldMapping = { leads: {}, contacts: {}, companies: {} };
try {
  const raw = fs.readFileSync(FIELD_MAPPING_PATH, 'utf-8');
  fieldMapping = JSON.parse(raw);
  const leadsCount = Object.keys(fieldMapping.leads || {}).length;
  const contactsCount = Object.keys(fieldMapping.contacts || {}).length;
  const companiesCount = Object.keys(fieldMapping.companies || {}).length;
  console.log(`Field mappings: leads=${leadsCount}, contacts=${contactsCount}, companies=${companiesCount}`);
} catch (e) {
  console.warn('Warning: Could not read field_mapping.json:', e.message);
}

// --- Build structure ---

// Group stages by pipeline pair key "amoPipelineId:kommoPipelineId"
const stagesByPipeline = {};
for (const s of stageRows) {
  const key = `${s.amo_pipeline_id}:${s.kommo_pipeline_id}`;
  if (!stagesByPipeline[key]) stagesByPipeline[key] = [];
  stagesByPipeline[key].push({
    amoStageId: s.amo_stage_id,
    kommoStageId: s.kommo_stage_id,
    amoStageName: s.amo_stage_name,
    kommoStageName: s.kommo_stage_name
  });
}

// Build pipeline objects
const pipelines = [];
for (const p of pipelineRows) {
  const key = `${p.amo_pipeline_id}:${p.kommo_pipeline_id}`;
  const stages = stagesByPipeline[key] || [];
  
  pipelines.push({
    amoPipelineId: p.amo_pipeline_id,
    kommoPipelineId: p.kommo_pipeline_id,
    amoPipelineName: p.amo_pipeline_name || null,
    kommoPipelineName: p.kommo_pipeline_name || null,
    stageCount: stages.length,
    stages: stages
  });
}

// Build user/manager mappings
const managers = userRows.map(u => ({
  amoUserId: u.amo_user_id,
  kommoUserId: u.kommo_user_id,
  amoUserName: u.amo_user_name,
  kommoUserName: u.kommo_user_name,
  amoEmail: u.amo_email,
  kommoEmail: u.kommo_email
}));

// Build field mappings - convert from object-keyed format to structured arrays
function convertFieldMap(fieldObj) {
  if (!fieldObj || typeof fieldObj !== 'object') return [];
  return Object.entries(fieldObj).map(([amoFieldId, mapping]) => ({
    amoFieldId: amoFieldId,
    kommoFieldId: mapping.kommoFieldId,
    amoFieldName: mapping.amoFieldName,
    kommoFieldName: mapping.kommoFieldName,
    amoFieldType: mapping.amoFieldType,
    kommoFieldType: mapping.kommoFieldType,
    amoGroup: mapping.amoGroup || null,
    transferMode: mapping.transferMode || null,
    enumMap: mapping.enumMap || null
  }));
}

const fields = {
  leads: convertFieldMap(fieldMapping.leads),
  contacts: convertFieldMap(fieldMapping.contacts),
  companies: convertFieldMap(fieldMapping.companies)
};

// --- Assemble final structure ---
const structure = {
  _meta: {
    description: 'Kommo CRM migration structure - full pipeline, stage, field, and manager mappings',
    generatedAt: new Date().toISOString(),
    version: '2.0',
    source: 'migration.db + field_mapping.json'
  },
  summary: {
    totalPipelines: pipelines.length,
    totalStages: stageRows.length,
    totalManagers: managers.length,
    totalFieldMappings: {
      leads: fields.leads.length,
      contacts: fields.contacts.length,
      companies: fields.companies.length
    },
    primaryPipelines: [
      {
        label: 'Школа/Репетиторство → RussianLanguage Department',
        amoPipelineId: 3456421,
        kommoPipelineId: 12856848
      },
      {
        label: 'Прогрев Маркетинг МШ → Diferred',
        amoPipelineId: 4790248,
        kommoPipelineId: 13165640
      }
    ]
  },
  pipelines: pipelines,
  managers: managers,
  fieldMappings: fields
};

// --- Write output ---
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(structure, null, 2), 'utf-8');
const stats = fs.statSync(OUTPUT_PATH);
console.log(`\n✅ Written: ${OUTPUT_PATH} (${(stats.size / 1024).toFixed(1)} KB)`);
console.log(`   Pipelines: ${pipelines.length}`);
console.log(`   Total stages: ${stageRows.length}`);
console.log(`   Managers: ${managers.length}`);
console.log(`   Field mappings: leads=${fields.leads.length}, contacts=${fields.contacts.length}, companies=${fields.companies.length}`);
