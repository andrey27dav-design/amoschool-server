const logger = require('../utils/logger');

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
 * Formats an AMO unix timestamp (seconds) as "📅 DD.MM.YYYY HH:MM" + newline in Moscow time (UTC+3).
 * Returns empty string if ts is falsy.
 */
function fmtDatePrefix(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const msk = new Date(d.getTime() + 3 * 3600000);
  const dd  = String(msk.getUTCDate()).padStart(2, '0');
  const mm  = String(msk.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = msk.getUTCFullYear();
  const hh  = String(msk.getUTCHours()).padStart(2, '0');
  const min = String(msk.getUTCMinutes()).padStart(2, '0');
  return '📅 ' + dd + '.' + mm + '.' + yyyy + ' ' + hh + ':' + min + '\n';
}



/**
 * Transform an AMO lead to Kommo lead format
 */
function transformLead(amoLead, stageMapping, fieldMapping, userMapping) {
  const kommoStatusId = stageMapping[amoLead.status_id] || null;
  // Build tags in Kommo format: [{name: "..."}] — drop amo IDs
  const tags = (amoLead._embedded?.tags || []).map(t => ({ name: t.name })).filter(t => t.name);

  const lead = {
    name: amoLead.name || `Lead #${amoLead.id}`,
    price: amoLead.price || 0,
    pipeline_id: null, // set by caller
  };

  // Apply responsible user mapping (AMO user id → Kommo user id)
  if (userMapping) {
    const amoUid = amoLead.responsible_user_id;
    const kommoUid = amoUid ? (userMapping[amoUid] || userMapping[String(amoUid)]) : null;
    if (kommoUid) lead.responsible_user_id = Number(kommoUid);
  }

  // Only set status_id if we have a valid mapping — null causes 400 in Kommo API
  if (kommoStatusId) lead.status_id = kommoStatusId;

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
    if (!mapped) { logger.warn(`[transformCustomFields] поле AMO #${field.field_id} ("${field.field_name || field.field_code || '?'}") не найдено в маппинге — пропускаем`); continue; }
    const { kommoFieldId, enumMap, kommoFieldType, amoFieldType, fieldType, transferMode } = mapped;

    // Priority: kommoFieldType → amoFieldType → fieldType (legacy mapping key) → 'text'
    const kType = kommoFieldType || amoFieldType || fieldType || 'text';

    let values;
    switch (kType) {
      case 'multitext': // phone, email — enum_code is category (WORK/HOME/MOB)
        values = (field.values || []).map(v => ({
          value: v.value,
          ...(v.enum_code ? { enum_code: v.enum_code } : {}),
        })).filter(v => v.value);
        break;

      case 'select':
      case 'radiobutton': {
        // Kommo select/radiobutton requires enum_id — NEVER send text (NotSupportedChoice).
        // If AMO field is multiselect mapped to Kommo select → take only FIRST valid enum_id.
        values = [];
        for (const v of (field.values || [])) {
          const kEnumId = enumMap && enumMap[v.enum_id];
          if (kEnumId) {
            values.push({ enum_id: kEnumId });
            break; // select/radiobutton takes exactly 1 value
          }
        }
        break;
      }

      case 'multiselect': {
        // Kommo multiselect — collect all matched enum_ids.
        values = [];
        for (const v of (field.values || [])) {
          const kEnumId = enumMap && enumMap[v.enum_id];
          if (kEnumId) {
            values.push({ enum_id: kEnumId });
          }
        }
        break;
      }

      case 'checkbox':
        // Kommo checkbox expects boolean true/false (NOT string "1"/"0")
        values = (field.values || []).map(v => ({ value: Boolean(v.value) }));
        break;

      case 'birthday':
      case 'date':
      case 'date_time':
        // AMO can send either unix timestamp (number) or ISO string with ms.
        // Kommo requires strict ISO 8601: "2026-02-24T06:46:00+00:00" (no milliseconds).
        values = (field.values || [])
          .filter(v => v.value != null && v.value !== '')
          .map(v => {
            let iso;
            const raw = v.value;
            if (typeof raw === 'number' || /^\d+$/.test(String(raw))) {
              // Unix timestamp (seconds) → ISO
              iso = new Date(parseInt(raw, 10) * 1000).toISOString();
            } else {
              // Already ISO string — just parse and re-format
              iso = new Date(raw).toISOString();
            }
            if (!iso || iso === 'Invalid Date') return null;
            // Strip milliseconds: "2026-02-24T06:46:00.000Z" → "2026-02-24T06:46:00+00:00"
            return { value: iso.replace(/\.\d{3}Z$/, '+00:00').replace(/Z$/, '+00:00') };
          })
          .filter(Boolean);
        break;

      default: // text, numeric, url, textarea — send value as plain string
        values = (field.values || [])
          .map(v => {
            // For select-type AMO fields mapped to text in Kommo — use text value
            if (v.value == null || v.value === '' || v.value === false) return null;
            return { value: String(v.value) };
          })
          .filter(Boolean);
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
function transformContact(amoContact, fieldMapping, userMapping) {
  const obj = {
    name: amoContact.name || `Contact #${amoContact.id}`,
    // Note: first_name/last_name are NOT valid Kommo API top-level fields — omit them
    custom_fields_values: transformCustomFields(amoContact.custom_fields_values, fieldMapping),
  };
  if (!obj.custom_fields_values.length) delete obj.custom_fields_values;
  // Apply responsible user mapping
  if (userMapping) {
    const amoUid = amoContact.responsible_user_id;
    const kommoUid = amoUid ? (userMapping[amoUid] || userMapping[String(amoUid)]) : null;
    if (kommoUid) obj.responsible_user_id = Number(kommoUid);
  }
  return obj;
}

/**
 * Transform AMO company to Kommo company format
 */
function transformCompany(amoCompany, fieldMapping, userMapping) {
  const obj = {
    name: amoCompany.name || `Company #${amoCompany.id}`,
    custom_fields_values: transformCustomFields(amoCompany.custom_fields_values, fieldMapping),
  };
  if (!obj.custom_fields_values.length) delete obj.custom_fields_values;
  // Apply responsible user mapping
  if (userMapping) {
    const amoUid = amoCompany.responsible_user_id;
    const kommoUid = amoUid ? (userMapping[amoUid] || userMapping[String(amoUid)]) : null;
    if (kommoUid) obj.responsible_user_id = Number(kommoUid);
  }
  return obj;
}

/**
 * AMO → Kommo task type mapping (AMO task_type_id → Kommo task_type_id).
 * Standard types 1 (Follow-up) and 2 (Meeting) are the same in both systems.
 * Custom types were created in Kommo to match AMO originals by name.
 */
const AMO_TO_KOMMO_TASK_TYPE = {
  1: 1,             // Связаться (Follow-up)
  2: 2,             // Встреча (Meeting)
  2377747: 4143052, // Написать
  2377744: 4143056, // Отправить КП
  2377729: 4143060, // Связаться с клиентом
  2377732: 4143064, // Напомнить клиенту
  2377735: 4143068, // Другое
  2378124: 4143072, // Связаться с клиентом
  2377738: 4143076, // Проверить оплату
  2377741: 4143080, // Назначить урок
  2378121: 4143084, // Поставить задачу преподователю
  2377750: 4143088, // Контроль
  2377753: 4143092, // Задача от РОПпа
  2388826: 4143096, // Реанимация
  2397082: 4143100, // Учебный отдел
  2518729: 4143104, // Напомнить клиенту_рассрочка
  3134518: 4143108, // Сделать рассылку
  3731890: 4143112, // Проверить оплату повторно
  4067422: 4143116, // Написать
  4114354: 4143120, // Трудоустройство
};

/**
 * Transform AMO task to Kommo task format
 */
function transformTask(amoTask, userMapping, entityKommoResponsibleId) {
  // complete_till must be a valid future/past unix timestamp > 0
  // is_completed is NOT accepted by Kommo POST /api/v4/tasks — causes 400
  const fallbackTill = Math.floor(Date.now() / 1000) + 86400; // tomorrow
  // Map AMO task_type_id → Kommo task_type_id using full mapping; fallback to 1 (Follow-up)
  const rawTypeId = amoTask.task_type_id;
  const safeTypeId = AMO_TO_KOMMO_TASK_TYPE[rawTypeId] || 1;
  const obj = {
    task_type_id: safeTypeId,
    text: fmtDatePrefix(amoTask.created_at) + ((amoTask.text && amoTask.text.trim()) ? amoTask.text : 'Задача'),
    complete_till: (amoTask.complete_till && amoTask.complete_till > 0)
      ? amoTask.complete_till
      : fallbackTill,
  };
  // Map responsible_user_id via userMapping; fallback to entity's manager
  if (userMapping) {
    const amoUid = amoTask.responsible_user_id;
    const kommoUid = amoUid ? (userMapping[amoUid] || userMapping[String(amoUid)]) : null;
    if (kommoUid) {
      obj.responsible_user_id = Number(kommoUid);
    } else if (entityKommoResponsibleId) {
      obj.responsible_user_id = Number(entityKommoResponsibleId);
    }
  } else if (entityKommoResponsibleId) {
    obj.responsible_user_id = Number(entityKommoResponsibleId);
  }
  // Only include result if it has content (empty object causes 400 in some Kommo versions)
  if (amoTask.result && typeof amoTask.result === 'object' && Object.keys(amoTask.result).length > 0) {
    obj.result = amoTask.result;
  } else if (typeof amoTask.result === 'string' && amoTask.result) {
    obj.result = { text: amoTask.result };
  }
  return obj;
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
  fmtDatePrefix,
  transformLead,
  transformContact,
  transformCompany,
  transformTask,
  transformCustomFields,
  buildStageMapping,
  AMO_STAGE_MAP,
  AMO_TO_KOMMO_TASK_TYPE,
};
