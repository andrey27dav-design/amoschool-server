const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

const kommoClient = axios.create({
  baseURL: config.kommo.baseUrl,
  headers: {
    Authorization: `Bearer ${config.kommo.token}`,
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Rate limiter: 300ms between requests (~3 req/sec, well below 7/sec limit)
let lastRequestTime = 0;
const MIN_INTERVAL = 300; // ms — conservative to avoid 429

async function rateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL - elapsed));
  }
  lastRequestTime = Date.now();
}

// 429 retry interceptor — wait Retry-After (or 2s) then retry up to 3 times
kommoClient.interceptors.response.use(null, async (error) => {
  const cfg = error.config;
  if (!cfg) return Promise.reject(error);
  cfg.__retryCount = cfg.__retryCount || 0;
  if (error.response && error.response.status === 429 && cfg.__retryCount < 3) {
    cfg.__retryCount++;
    const retryAfter = parseInt(error.response.headers['retry-after'] || '2', 10);
    const delay = Math.max(retryAfter * 1000, 2000);
    logger.warn(`[kommoApi] 429 received, retry #${cfg.__retryCount} after ${delay}ms`);
    await new Promise(r => setTimeout(r, delay));
    return kommoClient(cfg);
  }
  return Promise.reject(error);
});

async function getPipelines() {
  await rateLimit();
  const res = await kommoClient.get('/api/v4/leads/pipelines');
  return res.data._embedded?.pipelines || [];
}

async function getPipeline(pipelineId) {
  await rateLimit();
  const res = await kommoClient.get(`/api/v4/leads/pipelines/${pipelineId}`);
  return res.data;
}

async function getPipelineStatuses(pipelineId) {
  const pipeline = await getPipeline(pipelineId);
  return pipeline._embedded?.statuses || [];
}

/**
 * Create or update pipeline stages to match AMO structure
 */
async function syncPipelineStages(pipelineId, stages) {
  // Create one by one to avoid sort conflicts and get granular error info
  const created = [];
  for (const stage of stages) {
    await rateLimit();
    try {
      const res = await kommoClient.post(`/api/v4/leads/pipelines/${pipelineId}/statuses`, [stage]);
      const s = res.data._embedded?.statuses?.[0];
      if (s) created.push(s);
      logger.info(`Kommo: created stage "${stage.name}" id=${s?.id} sort=${s?.sort}`);
    } catch (e) {
      const detail = JSON.stringify(e.response?.data);
      logger.error(`Kommo: failed to create stage "${stage.name}": HTTP ${e.response?.status} ${detail}`);
      // continue to next stage
    }
  }
  return created;
}

async function createLead(lead) {
  await rateLimit();
  const res = await kommoClient.post('/api/v4/leads', [lead]);
  return res.data._embedded?.leads?.[0] || null;
}

async function createLeadsBatch(leads) {
  // Max 50 per request
  const chunks = [];
  for (let i = 0; i < leads.length; i += 50) chunks.push(leads.slice(i, i + 50));
  const created = [];
  for (const chunk of chunks) {
    await rateLimit();
    try {
      const res = await kommoClient.post('/api/v4/leads', chunk);
      created.push(...(res.data._embedded?.leads || []));
      logger.info(`Kommo: created ${created.length} leads so far`);
    } catch (e) {
      if (e.response?.status === 400) {
        logger.error('Kommo leads 400 details:', JSON.stringify(e.response?.data));
        logger.error('Kommo leads 400 payload sample:', JSON.stringify(chunk[0]));
        require('fs').writeFileSync('/tmp/kommo_400_payload.json', JSON.stringify({error: e.response?.data, payload: chunk[0]}, null, 2));
        // Fallback: create without custom_fields_values, then PATCH separately
        const stripped = chunk.map(l => {
          const { custom_fields_values, ...rest } = l;
          return rest;
        });
        await rateLimit();
        let res2;
        try {
          res2 = await kommoClient.post('/api/v4/leads', stripped);
        } catch (e2) {
          logger.error('Kommo leads fallback 400 details:', JSON.stringify(e2.response?.data));
          logger.error('Kommo leads fallback payload sample:', JSON.stringify(stripped[0]));
          require('fs').writeFileSync('/tmp/kommo_400_fallback.json', JSON.stringify({error: e2.response?.data, payload: stripped[0]}, null, 2));
          throw e2;
        }
        const fallbackLeads = res2.data._embedded?.leads || [];
        logger.info(`Kommo: created ${fallbackLeads.length} leads (fallback, now patching custom fields)`);
        for (let i = 0; i < fallbackLeads.length; i++) {
          const cfv = chunk[i]?.custom_fields_values;
          if (cfv && cfv.length > 0) {
            try {
              await rateLimit();
              await updateLead(fallbackLeads[i].id, { custom_fields_values: cfv });
              logger.info(`Kommo: patched custom fields for lead ${fallbackLeads[i].id}`);
            } catch (patchErr) {
              logger.error(`Kommo: PATCH lead ${fallbackLeads[i].id} custom fields failed: status=${patchErr.response?.status}`, JSON.stringify(patchErr.response?.data));
            }
          }
        }
        created.push(...fallbackLeads);
      } else {
        throw e;
      }
    }
  }
  return created;
}

async function updateLead(leadId, data) {
  await rateLimit();
  // Kommo API: PATCH /api/v4/leads with array [{id, ...fields}]
  const res = await kommoClient.patch('/api/v4/leads', [{ id: parseInt(leadId), ...data }]);
  return res.data._embedded?.leads?.[0] || null;
}

async function updateContact(contactId, data) {
  await rateLimit();
  // Kommo API: PATCH /api/v4/contacts with array [{id, ...fields}]
  const res = await kommoClient.patch('/api/v4/contacts', [{ id: parseInt(contactId), ...data }]);
  return res.data._embedded?.contacts?.[0] || null;
}

async function updateCompany(companyId, data) {
  await rateLimit();
  // Kommo API: PATCH /api/v4/companies with array [{id, ...fields}]
  const res = await kommoClient.patch('/api/v4/companies', [{ id: parseInt(companyId), ...data }]);
  return res.data._embedded?.companies?.[0] || null;
}

async function createContact(contact) {
  await rateLimit();
  const res = await kommoClient.post('/api/v4/contacts', [contact]);
  return res.data._embedded?.contacts?.[0] || null;
}

async function createContactsBatch(contacts) {
  const chunks = [];
  for (let i = 0; i < contacts.length; i += 50) chunks.push(contacts.slice(i, i + 50));
  const created = [];
  for (const chunk of chunks) {
    await rateLimit();
    try {
      const res = await kommoClient.post('/api/v4/contacts', chunk);
      created.push(...(res.data._embedded?.contacts || []));
      logger.info(`Kommo: created ${created.length} contacts so far`);
    } catch (e) {
      if (e.response?.status === 400) {
        const errData = e.response?.data;
        logger.error('Kommo contacts 400 details:', JSON.stringify(errData));
        // Fallback: create WITHOUT custom_fields_values, then PATCH them separately
        const stripped = chunk.map(c => ({ name: c.name }));
        await rateLimit();
        const res2 = await kommoClient.post('/api/v4/contacts', stripped);
        const fallbackContacts = res2.data._embedded?.contacts || [];
        logger.info(`Kommo: created ${fallbackContacts.length} contacts (fallback, now patching custom fields)`);
        // PATCH each contact individually with its custom_fields_values
        for (let i = 0; i < fallbackContacts.length; i++) {
          const cfv = chunk[i]?.custom_fields_values;
          if (cfv && cfv.length > 0) {
            try {
              await rateLimit();
              await updateContact(fallbackContacts[i].id, { custom_fields_values: cfv });
              logger.info(`Kommo: patched custom fields for contact ${fallbackContacts[i].id}`);
            } catch (patchErr) {
              logger.error(`Kommo: PATCH contact ${fallbackContacts[i].id} custom fields failed: status=${patchErr.response?.status}`, JSON.stringify(patchErr.response?.data));
            }
          }
        }
        created.push(...fallbackContacts);
      } else {
        throw e;
      }
    }
  }
  return created;
}

async function createCompany(company) {
  await rateLimit();
  const res = await kommoClient.post('/api/v4/companies', [company]);
  return res.data._embedded?.companies?.[0] || null;
}

async function createCompaniesBatch(companies) {
  const chunks = [];
  for (let i = 0; i < companies.length; i += 50) chunks.push(companies.slice(i, i + 50));
  const created = [];
  for (const chunk of chunks) {
    await rateLimit();
    try {
      const res = await kommoClient.post('/api/v4/companies', chunk);
      created.push(...(res.data._embedded?.companies || []));
      logger.info(`Kommo: created ${created.length} companies so far`);
    } catch (e) {
      if (e.response?.status === 400) {
        logger.error('Kommo companies 400 details:', JSON.stringify(e.response?.data));
        const stripped = chunk.map(c => ({ name: c.name }));
        await rateLimit();
        const res2 = await kommoClient.post('/api/v4/companies', stripped);
        const fallbackCompanies = res2.data._embedded?.companies || [];
        for (let i = 0; i < fallbackCompanies.length; i++) {
          const cfv = chunk[i]?.custom_fields_values;
          if (cfv && cfv.length > 0) {
            try {
              await rateLimit();
              await updateCompany(fallbackCompanies[i].id, { custom_fields_values: cfv });
            } catch (patchErr) {
              logger.error(`Kommo: PATCH company ${fallbackCompanies[i].id} failed: status=${patchErr.response?.status}`, JSON.stringify(patchErr.response?.data));
            }
          }
        }
        created.push(...fallbackCompanies);
        logger.info(`Kommo: created ${created.length} companies (fallback)`);
      } else {
        throw e;
      }
    }
  }
  return created;
}

async function createTask(task) {
  await rateLimit();
  const res = await kommoClient.post('/api/v4/tasks', [task]);
  return res.data._embedded?.tasks?.[0] || null;
}

async function createTasksBatch(tasks) {
  const chunks = [];
  for (let i = 0; i < tasks.length; i += 50) chunks.push(tasks.slice(i, i + 50));
  const created = [];
  for (const chunk of chunks) {
    // ── Попытка 1: отправляем чанк целиком ──
    await rateLimit();
    try {
      const res = await kommoClient.post('/api/v4/tasks', chunk);
      const embedded = res.data._embedded?.tasks || [];
      logger.info(`Kommo createTasksBatch: HTTP ${res.status}, tasks=${embedded.length}, resp_keys=${Object.keys(res.data||{}).join(',')}`);
      created.push(...embedded);
      continue; // чанк OK
    } catch (e1) {
      const body1 = e1.response?.data ? JSON.stringify(e1.response.data).slice(0,300) : e1.message;
      logger.warn(`Kommo createTasksBatch попытка 1 провалена: ${body1}`);
    }

    // ── Попытка 2: ждём 1 сек и повторяем чанк ──
    await new Promise(r => setTimeout(r, 1000));
    await rateLimit();
    try {
      const res2 = await kommoClient.post('/api/v4/tasks', chunk);
      const embedded2 = res2.data._embedded?.tasks || [];
      logger.info(`Kommo createTasksBatch retry OK: tasks=${embedded2.length}`);
      created.push(...embedded2);
      continue;
    } catch (e2) {
      const body2 = e2.response?.data ? JSON.stringify(e2.response.data).slice(0,300) : e2.message;
      logger.warn(`Kommo createTasksBatch попытка 2 провалена: ${body2}. Переключаемся на поштучный режим.`);
    }

    // ── Попытка 3: отправляем по одной задаче ──
    for (let ti = 0; ti < chunk.length; ti++) {
      const singleTask = chunk[ti];
      await rateLimit();
      try {
        const res3 = await kommoClient.post('/api/v4/tasks', [singleTask]);
        const embedded3 = res3.data._embedded?.tasks || [];
        if (embedded3.length > 0) {
          created.push(embedded3[0]);
          logger.info(`Kommo createTasksBatch single[${ti}]: OK (id=${embedded3[0].id})`);
        } else {
          created.push(null); // пустой ответ
        }
      } catch (e3) {
        const body3 = e3.response?.data ? JSON.stringify(e3.response.data).slice(0,300) : e3.message;
        logger.warn(`Kommo createTasksBatch single[${ti}] пропуск: ${body3} | entity_id=${singleTask.entity_id}, type=${singleTask.entity_type}`);
        created.push(null); // сохраняем позицию для корректного idx-маппинга
      }
    }
  }
  logger.info(`Kommo createTasksBatch: returning ${created.length} of ${tasks.length} total`);
  return created;
}

async function completeTasksBatch(taskIds) {
  if (!taskIds || taskIds.length === 0) return;
  const chunks = [];
  for (let i = 0; i < taskIds.length; i += 50) chunks.push(taskIds.slice(i, i + 50));
  for (const chunk of chunks) {
    await rateLimit();
    try {
      const payload = chunk.map(id => ({ id, is_completed: true }));
      await kommoClient.patch('/api/v4/tasks', payload);
      logger.info('Kommo completeTasksBatch: помечено выполненных: ' + chunk.length);
    } catch (e) {
      const body = e.response && e.response.data
        ? JSON.stringify(e.response.data).slice(0, 300)
        : e.message;
      logger.error('Kommo completeTasksBatch error: ' + body);
      // non-critical — не бросаем, задача уже создана
    }
  }
}

async function createNote(entityType, entityId, noteData) {
  await rateLimit();
  const payload = [{ ...noteData, entity_id: entityId }];
  const res = await kommoClient.post(`/api/v4/${entityType}/notes`, payload);
  return res.data._embedded?.notes?.[0] || null;
}

async function createNotesBatch(entityType, notes) {
  const chunks = [];
  for (let i = 0; i < notes.length; i += 50) chunks.push(notes.slice(i, i + 50));
  const created = [];
  for (const chunk of chunks) {
    // ── Попытка 1: отправляем чанк целиком ──
    await rateLimit();
    try {
      try { require('fs').writeFileSync(`/tmp/notes_chunk_${entityType}.json`, JSON.stringify(chunk, null, 2)); } catch(_){}
      logger.info(`[debug] notes chunk[0] entity_id: ${chunk[0]?.entity_id} (${typeof chunk[0]?.entity_id}), sample: ${JSON.stringify(chunk[0])?.slice(0,200)}`);
      const res = await kommoClient.post(`/api/v4/${entityType}/notes`, chunk);
      const embedded = res.data._embedded?.notes || [];
      logger.info(`Kommo createNotesBatch(${entityType}): HTTP ${res.status}, notes=${embedded.length}`);
      created.push(...embedded);
      continue; // чанк OK — идём к следующему
    } catch (e1) {
      const body1 = e1.response?.data ? JSON.stringify(e1.response.data).slice(0,300) : e1.message;
      logger.warn(`Kommo createNotesBatch(${entityType}) попытка 1 провалена: ${body1}`);
    }

    // ── Попытка 2: ждём 1 сек и повторяем чанк целиком ──
    await new Promise(r => setTimeout(r, 1000));
    await rateLimit();
    try {
      const res2 = await kommoClient.post(`/api/v4/${entityType}/notes`, chunk);
      const embedded2 = res2.data._embedded?.notes || [];
      logger.info(`Kommo createNotesBatch(${entityType}) retry OK: notes=${embedded2.length}`);
      created.push(...embedded2);
      continue; // retry помог — идём к следующему чанку
    } catch (e2) {
      const body2 = e2.response?.data ? JSON.stringify(e2.response.data).slice(0,300) : e2.message;
      logger.warn(`Kommo createNotesBatch(${entityType}) попытка 2 провалена: ${body2}. Переключаемся на поштучный режим.`);
    }

    // ── Попытка 3: отправляем по одной заметке ──
    for (let ni = 0; ni < chunk.length; ni++) {
      const singleNote = chunk[ni];
      await rateLimit();
      try {
        const res3 = await kommoClient.post(`/api/v4/${entityType}/notes`, [singleNote]);
        const embedded3 = res3.data._embedded?.notes || [];
        if (embedded3.length > 0) {
          created.push(embedded3[0]);
          logger.info(`Kommo createNotesBatch(${entityType}) single[${ni}]: OK (id=${embedded3[0].id})`);
        } else {
          created.push(null); // пустой ответ
        }
      } catch (e3) {
        const body3 = e3.response?.data ? JSON.stringify(e3.response.data).slice(0,300) : e3.message;
        logger.warn(`Kommo createNotesBatch(${entityType}) single[${ni}] пропуск: ${body3} | entity_id=${singleNote.entity_id}, type=${singleNote.note_type}`);
        created.push(null); // сохраняем позицию для корректного idx-маппинга
      }
    }
  }
  logger.info(`Kommo createNotesBatch(${entityType}): returning ${created.length} of ${notes.length} total`);
  return created;
}

async function linkContactToLead(leadId, contactId) {
  // Kommo API: PATCH /api/v4/leads with _embedded.contacts
  await rateLimit();
  const res = await kommoClient.patch('/api/v4/leads', [
    { id: parseInt(leadId), _embedded: { contacts: [{ id: parseInt(contactId) }] } },
  ]);
  return res.data;
}

async function linkCompanyToLead(leadId, companyId) {
  // Kommo API: PATCH /api/v4/leads with _embedded.companies  
  await rateLimit();
  const res = await kommoClient.patch('/api/v4/leads', [
    { id: parseInt(leadId), _embedded: { companies: [{ id: parseInt(companyId) }] } },
  ]);
  return res.data;
}

async function getCustomFields(entityType = 'leads') {
  await rateLimit();
  const res = await kommoClient.get(`/api/v4/${entityType}/custom_fields`, { params: { limit: 250 } });
  return res.data._embedded?.custom_fields || [];
}

/**
 * Получает группы кастомных полей из Kommo CRM для указанного типа сущности.
 * Необходимо для сопоставления групп при переносе полей из AMO.
 */
async function getCustomFieldGroups(entityType = 'leads') {
  await rateLimit();
  const res = await kommoClient.get(`/api/v4/${entityType}/custom_fields/groups`, {
    params: { limit: 250 }
  });
  return res.data._embedded?.custom_field_groups || [];
}

async function createCustomFieldGroup(entityType, groupData) {
  await rateLimit();
  const res = await kommoClient.post(`/api/v4/${entityType}/custom_fields/groups`, [groupData]);
  return res.data._embedded?.custom_field_groups?.[0] || null;
}

async function createCustomField(entityType, fieldData) {
  await rateLimit();
  const res = await kommoClient.post(`/api/v4/${entityType}/custom_fields`, [fieldData]);
  return res.data._embedded?.custom_fields?.[0] || null;
}

async function createCustomFieldsBatch(entityType, fields) {
  const created = [];
  const BATCH = 50;
  for (let i = 0; i < fields.length; i += BATCH) {
    await rateLimit();
    const chunk = fields.slice(i, i + BATCH);
    const res = await kommoClient.post(`/api/v4/${entityType}/custom_fields`, chunk);
    created.push(...(res.data._embedded?.custom_fields || []));
  }
  return created;
}

/**
 * Обновить кастомное поле в Kommo (например, добавить варианты списка).
 */
async function patchCustomField(entityType, fieldId, patchData) {
  await rateLimit();
  const res = await kommoClient.patch(
    `/api/v4/${entityType}/custom_fields/${fieldId}`,
    patchData
  );
  return res.data || null;
}

/**
 * Delete a lead (for rollback)
 */
async function deleteLead(leadId) {
  await rateLimit();
  await kommoClient.delete(`/api/v4/leads`, { data: [{ id: leadId }] });
}

async function deleteLeadsBatch(leadIds) {
  // Kommo API does not support DELETE for leads (405).
  // Instead, move leads to "Closed - lost" (status_id: 143) to archive them.
  if (!leadIds.length) return;
  const chunks = [];
  for (let i = 0; i < leadIds.length; i += 50) chunks.push(leadIds.slice(i, i + 50));
  for (const chunk of chunks) {
    await rateLimit();
    await kommoClient.patch('/api/v4/leads', chunk.map((id) => ({ id, status_id: 143 })));
    logger.info(`Kommo: archived ${chunk.length} leads to Closed-lost (rollback)`);
  }
}

async function deleteContactsBatch(contactIds) {
  // Kommo API: try individual DELETE since batch DELETE may not be supported.
  if (!contactIds.length) return;
  let deleted = 0;
  for (const id of contactIds) {
    await rateLimit();
    try {
      await kommoClient.delete(`/api/v4/contacts/${id}`);
      deleted++;
    } catch (e) {
      logger.warn(`Kommo: could not delete contact ${id}: HTTP ${e.response?.status}`);
    }
  }
  logger.info(`Kommo: deleted ${deleted}/${contactIds.length} contacts (rollback)`);
}

async function deleteCompaniesBatch(companyIds) {
  // Kommo API: individual DELETE per company.
  if (!companyIds.length) return;
  let deleted = 0;
  for (const id of companyIds) {
    await rateLimit();
    try {
      await kommoClient.delete(`/api/v4/companies/${id}`);
      deleted++;
    } catch (e) {
      logger.warn(`Kommo: could not delete company ${id}: HTTP ${e.response?.status}`);
    }
  }
  logger.info(`Kommo: deleted ${deleted}/${companyIds.length} companies (rollback)`);
}

module.exports = {
  getPipelines,
  getPipeline,
  getPipelineStatuses,
  syncPipelineStages,
  createLead,
  createLeadsBatch,
  updateLead,
  createContact,
  createContactsBatch,
  createCompany,
  createCompaniesBatch,
  createTask,
  createTasksBatch,
  completeTasksBatch,
  createNote,
  createNotesBatch,
  updateContact,
  updateCompany,
  linkContactToLead,
  linkCompanyToLead,
  getCustomFields,
  getCustomFieldGroups,
  createCustomFieldGroup,
  createCustomField,
  createCustomFieldsBatch,
  patchCustomField,
  deleteLead,
  deleteLeadsBatch,
  deleteContactsBatch,
  deleteCompaniesBatch,
};
