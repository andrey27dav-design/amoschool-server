/**
 * fieldMapping.js
 * Builds AMO→Kommo custom field mapping.
 * For fields that exist in AMO but not in Kommo — creates them automatically,
 * preserving is_api_only, hidden_statuses (mapped via stageMapping), enums.
 */
const path = require('path');
const fs = require('fs-extra');
const config = require('../config');
const logger = require('./logger');

const FIELD_MAPPING_FILE = path.resolve(config.backupDir, 'field_mapping.json');

// Field types safe to create in Kommo
const CREATABLE_TYPES = new Set([
  'text', 'numeric', 'textarea', 'checkbox', 'date', 'date_time',
  'url', 'select', 'multiselect', 'radiobutton', 'multitext',
]);

/**
 * Convert an AMO field to a Kommo create payload.
 * Maps hidden_statuses/required_statuses stage IDs via stageMapping.
 */
function buildCreatePayload(amoField, stageMapping, kommoPipelineId) {
  const payload = {
    name: amoField.name,
    type: amoField.type,
    sort: amoField.sort || 100,
    is_api_only: amoField.is_api_only || false,
  };

  // Enums: copy value + sort only (Kommo assigns new IDs)
  if (amoField.enums && amoField.enums.length > 0) {
    payload.enums = amoField.enums.map((e, i) => ({
      value: e.value,
      sort: e.sort || (i + 1) * 10,
    }));
  }

  // hidden_statuses: map AMO status_id → Kommo status_id via stageMapping
  if (amoField.hidden_statuses && amoField.hidden_statuses.length > 0 && stageMapping && kommoPipelineId) {
    const mapped = [];
    for (const hs of amoField.hidden_statuses) {
      const kommoStatusId = stageMapping[String(hs.status_id)];
      if (kommoStatusId) {
        mapped.push({ pipeline_id: kommoPipelineId, status_id: kommoStatusId });
      }
    }
    if (mapped.length > 0) payload.hidden_statuses = mapped;
  }

  // required_statuses: same mapping
  if (amoField.required_statuses && amoField.required_statuses.length > 0 && stageMapping && kommoPipelineId) {
    const mapped = [];
    for (const rs of amoField.required_statuses) {
      const kommoStatusId = stageMapping[String(rs.status_id)];
      if (kommoStatusId) {
        mapped.push({ pipeline_id: kommoPipelineId, status_id: kommoStatusId });
      }
    }
    if (mapped.length > 0) payload.required_statuses = mapped;
  }

  return payload;
}

/**
 * Build enumMap for a field that already exists in Kommo.
 * Matches AMO enum variants to Kommo enum variants by value text.
 */
function buildEnumMap(amoField, kommoField) {
  const enumMap = {};
  if (!['select', 'multiselect', 'radiobutton'].includes(amoField.type)) return enumMap;
  if (!amoField.enums || !kommoField.enums) return enumMap;
  const kByVal = {};
  kommoField.enums.forEach(e => { kByVal[(e.value || '').toLowerCase().trim()] = e.id; });
  amoField.enums.forEach(ae => {
    const kId = kByVal[(ae.value || '').toLowerCase().trim()];
    if (kId) enumMap[ae.id] = kId;
  });
  return enumMap;
}

/**
 * Build mapping for one entity. Creates missing fields in Kommo.
 * Returns: { mapping: {[amoFieldId]: {kommoFieldId, fieldType, enumMap}}, stats }
 */
async function buildEntityFieldMapping(entityType, amoFields, kommoFields, kommoApi, stageMapping, kommoPipelineId) {
  const kByCode = {};
  const kByName = {};
  kommoFields.forEach(f => {
    if (f.code) kByCode[f.code.toUpperCase()] = f;
    kByName[(f.name || '').toLowerCase().trim()] = f;
  });

  const mapping = {};
  const stats = { matched: 0, created: 0, skipped: 0 };
  const toCreate = []; // { amoField, payload }

  for (const af of amoFields) {
    // Skip system predefined immutable fields
    if (af.is_predefined && af.is_deletable === false) { stats.skipped++; continue; }
    // Skip unsupported types
    if (!CREATABLE_TYPES.has(af.type)) { stats.skipped++; continue; }

    // Try to match existing Kommo field by code then by name
    let kf = af.code ? kByCode[af.code.toUpperCase()] : null;
    if (!kf) kf = kByName[(af.name || '').toLowerCase().trim()];

    if (kf) {
      mapping[af.id] = { kommoFieldId: kf.id, fieldType: af.type, enumMap: buildEnumMap(af, kf) };
      stats.matched++;
    } else {
      toCreate.push({ amoField: af, payload: buildCreatePayload(af, stageMapping, kommoPipelineId) });
    }
  }

  // Batch-create missing fields (50 per request)
  if (toCreate.length > 0) {
    logger.info(`[fieldMapping] ${entityType}: creating ${toCreate.length} missing fields in Kommo`);
    const BATCH = 50;
    for (let i = 0; i < toCreate.length; i += BATCH) {
      const chunk = toCreate.slice(i, i + BATCH);
      let created;
      try {
        created = await kommoApi.createCustomFieldsBatch(entityType, chunk.map(c => c.payload));
      } catch (e) {
        logger.error(`[fieldMapping] Failed batch create ${entityType} fields: ${e.message}`);
        stats.skipped += chunk.length;
        continue;
      }
      for (let j = 0; j < chunk.length; j++) {
        const kf = created[j];
        const af = chunk[j].amoField;
        if (!kf) { stats.skipped++; continue; }
        // Build enumMap by position (Kommo preserves creation order)
        const enumMap = {};
        if (af.enums && kf.enums) {
          af.enums.forEach((ae, idx) => {
            if (kf.enums[idx]) enumMap[ae.id] = kf.enums[idx].id;
          });
        }
        mapping[af.id] = { kommoFieldId: kf.id, fieldType: af.type, enumMap };
        stats.created++;
        logger.info(`[fieldMapping] Created ${entityType} field "${af.name}" (is_api_only=${af.is_api_only}) → Kommo ID ${kf.id}`);
      }
    }
  }

  return { mapping, stats };
}

/**
 * Build field mappings for leads, contacts, companies.
 * Creates missing fields in Kommo.
 */
async function buildAllFieldMappings(amoApi, kommoApi, stageMapping, kommoPipelineId) {
  const entities = ['leads', 'contacts', 'companies'];
  const result = {};
  const totalStats = { matched: 0, created: 0, skipped: 0 };

  for (const entity of entities) {
    const [amoFields, kommoFields] = await Promise.all([
      amoApi.getCustomFields(entity),
      kommoApi.getCustomFields(entity),
    ]);
    const { mapping, stats } = await buildEntityFieldMapping(
      entity, amoFields, kommoFields, kommoApi, stageMapping, kommoPipelineId
    );
    result[entity] = mapping;
    totalStats.matched += stats.matched;
    totalStats.created += stats.created;
    totalStats.skipped += stats.skipped;
    logger.info(`[fieldMapping] ${entity}: matched=${stats.matched}, created=${stats.created}, skipped=${stats.skipped}`);
  }

  return { mapping: result, stats: totalStats };
}

function saveFieldMapping(mapping) {
  fs.ensureDirSync(path.dirname(FIELD_MAPPING_FILE));
  fs.writeJsonSync(FIELD_MAPPING_FILE, mapping, { spaces: 2 });
}

function loadFieldMapping() {
  if (!fs.existsSync(FIELD_MAPPING_FILE)) return null;
  try { return fs.readJsonSync(FIELD_MAPPING_FILE); } catch { return null; }
}

function getFieldMappingStats(mapping) {
  const stats = {};
  for (const [entity, map] of Object.entries(mapping || {})) {
    stats[entity] = Object.keys(map).length;
  }
  return stats;
}

module.exports = {
  buildCreatePayload,
  buildAllFieldMappings,
  saveFieldMapping,
  loadFieldMapping,
  getFieldMappingStats,
  FIELD_MAPPING_FILE,
};
