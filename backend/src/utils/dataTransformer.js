// Maps AMO CRM stage IDs to Kommo CRM stage names
// AMO pipeline: 3456421 (Школа/Репетиторство)
// Kommo pipeline: 12856848 (russianlanguadge department)

const AMO_STAGE_MAP = {
  34305358: 'Разобранное',
  43874146: 'Назначение',
  69395438: 'Распределение',
  34305361: 'Взять в работу',
  82359846: 'Были на связи',
  44960335: 'Клиент классифицирован',
  34486387: 'Дано Пробное',
  34336828: 'Доведено Пробное',
  82359850: 'Предложение сделано',
  82359854: 'Потенциал на сделку',
  34506946: 'Счет выставлен',
  34305370: 'Оплата',
};

/**
 * Transform an AMO lead to Kommo lead format
 */
function transformLead(amoLead, stageMapping, fieldMapping) {
  const kommoStatusId = stageMapping[amoLead.status_id] || null;
  // Build tags in Kommo format: [{name: "..."}] — drop amo IDs
  const tags = (amoLead._embedded?.tags || []).map(t => ({ name: t.name })).filter(t => t.name);

  const lead = {
    name: amoLead.name || `Lead #${amoLead.id}`,
    price: amoLead.price || 0,
    status_id: kommoStatusId,
    pipeline_id: null, // set by caller
    created_at: amoLead.created_at,
    updated_at: amoLead.updated_at,
    closed_at: amoLead.closed_at,
    // responsible_user_id: null — omit, Kommo assigns to token owner
  };
  const cfv = transformCustomFields(amoLead.custom_fields_values, fieldMapping);
  if (cfv.length > 0) lead.custom_fields_values = cfv;

  if (tags.length > 0) {
    lead._embedded = { tags };
  }

  return lead;
}

/**
 * Transform custom fields from AMO to Kommo format
 */
function transformCustomFields(amoValues, fieldMapping) {
  if (!amoValues || !amoValues.length || !fieldMapping) return [];
  const result = [];
  for (const field of amoValues) {
    const mapped = fieldMapping[field.field_id];
    if (!mapped) continue;
    const { kommoFieldId, fieldType, enumMap } = mapped;
    let values;
    switch (fieldType) {
      case 'multitext': // phone, email — preserve enum_code, drop enum_id
        values = (field.values || []).map(v => ({
          value: v.value,
          ...(v.enum_code ? { enum_code: v.enum_code } : {}),
        })).filter(v => v.value);
        break;
      case 'select':
      case 'radiobutton':
        values = (field.values || []).map(v => {
          const kEnumId = enumMap[v.enum_id];
          return kEnumId ? { enum_id: kEnumId } : null;
        }).filter(Boolean);
        break;
      case 'multiselect':
        values = (field.values || []).map(v => {
          const kEnumId = enumMap[v.enum_id];
          return kEnumId ? { enum_id: kEnumId } : null;
        }).filter(Boolean);
        break;
      default: // text, numeric, date, url, textarea, date_time, checkbox
        values = (field.values || []).map(v => ({ value: v.value }))
          .filter(v => v.value != null && v.value !== '');
        break;
    }
    if (values && values.length > 0) {
      result.push({ field_id: kommoFieldId, values });
    }
  }
  return result;
}

/**
 * Transform AMO contact to Kommo contact format
 */
function transformContact(amoContact, fieldMapping) {
  return {
    name: amoContact.name || `Contact #${amoContact.id}`,
    first_name: amoContact.first_name || '',
    last_name: amoContact.last_name || '',
    created_at: amoContact.created_at,
    updated_at: amoContact.updated_at,
    custom_fields_values: transformCustomFields(amoContact.custom_fields_values, fieldMapping),
  };
}

/**
 * Transform AMO company to Kommo company format
 */
function transformCompany(amoCompany, fieldMapping) {
  return {
    name: amoCompany.name || `Company #${amoCompany.id}`,
    created_at: amoCompany.created_at,
    updated_at: amoCompany.updated_at,
    custom_fields_values: transformCustomFields(amoCompany.custom_fields_values, fieldMapping),
  };
}

/**
 * Transform AMO task to Kommo task format
 */
function transformTask(amoTask, entityIdMap) {
  return {
    task_type_id: amoTask.task_type_id || 1,
    text: amoTask.text || '',
    complete_till: amoTask.complete_till,
    is_completed: amoTask.is_completed || false,
    result: amoTask.result || {},
    created_at: amoTask.created_at,
    updated_at: amoTask.updated_at,
  };
}

/**
 * Build stage mapping from AMO stage IDs to Kommo stage IDs
 */
function buildStageMapping(amoStages, kommoStages) {
  const mapping = {};
  // Match by sort order (same position) or by name
  const kommoBySort = {};
  const kommoByName = {};

  kommoStages.forEach((s) => {
    if (s.sort < 10000) {
      kommoBySort[s.sort] = s.id;
      kommoByName[s.name.toLowerCase().trim()] = s.id;
    }
  });

  const amoSorted = [...amoStages].filter((s) => s.sort < 10000).sort((a, b) => a.sort - b.sort);
  const kommoSorted = kommoStages.filter((s) => s.sort < 10000).sort((a, b) => a.sort - b.sort);

  amoSorted.forEach((amoStage, index) => {
    const name = AMO_STAGE_MAP[amoStage.id] || amoStage.name;
    const nameLower = name.toLowerCase().trim();

    // Try name match first
    if (kommoByName[nameLower]) {
      mapping[amoStage.id] = kommoByName[nameLower];
    } else if (kommoSorted[index]) {
      // Fallback: map by position
      mapping[amoStage.id] = kommoSorted[index].id;
    }
  });

  return mapping;
}

module.exports = {
  transformLead,
  transformContact,
  transformCompany,
  transformTask,
  transformCustomFields,
  buildStageMapping,
  AMO_STAGE_MAP,
};
