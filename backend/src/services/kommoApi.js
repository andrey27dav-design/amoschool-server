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

// Rate limiter: max 7 requests/sec
let lastRequestTime = 0;
const MIN_INTERVAL = 150;

async function rateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL - elapsed));
  }
  lastRequestTime = Date.now();
}

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
        logger.error('Kommo leads 400, retrying without custom fields. Response:', JSON.stringify(e.response?.data));
        // Fallback: retry without custom_fields_values but keep tags, pipeline_id, status_id
        const stripped = chunk.map(l => {
          const { custom_fields_values, ...rest } = l;
          return rest;
        });
        await rateLimit();
        const res2 = await kommoClient.post('/api/v4/leads', stripped);
        created.push(...(res2.data._embedded?.leads || []));
        logger.info(`Kommo: created ${created.length} leads (without custom fields fallback)`);
      } else {
        throw e;
      }
    }
  }
  return created;
}

async function updateLead(leadId, data) {
  await rateLimit();
  const res = await kommoClient.patch(`/api/v4/leads/${leadId}`, data);
  return res.data;
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
        logger.error('Kommo contacts 400, retrying without custom fields. Response:', JSON.stringify(e.response?.data));
        // Fallback: retry without custom_fields_values
        const stripped = chunk.map(c => ({ name: c.name }));
        await rateLimit();
        const res2 = await kommoClient.post('/api/v4/contacts', stripped);
        created.push(...(res2.data._embedded?.contacts || []));
        logger.info(`Kommo: created ${created.length} contacts (without custom fields fallback)`);
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
        logger.error('Kommo companies 400, retrying without custom fields. Response:', JSON.stringify(e.response?.data));
        const stripped = chunk.map(c => ({ name: c.name }));
        await rateLimit();
        const res2 = await kommoClient.post('/api/v4/companies', stripped);
        created.push(...(res2.data._embedded?.companies || []));
        logger.info(`Kommo: created ${created.length} companies (without custom fields fallback)`);
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
    await rateLimit();
    const res = await kommoClient.post('/api/v4/tasks', chunk);
    created.push(...(res.data._embedded?.tasks || []));
    logger.info(`Kommo: created ${created.length} tasks so far`);
  }
  return created;
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
    await rateLimit();
    const res = await kommoClient.post(`/api/v4/${entityType}/notes`, chunk);
    created.push(...(res.data._embedded?.notes || []));
  }
  return created;
}

async function linkContactToLead(leadId, contactId) {
  await rateLimit();
  const res = await kommoClient.post(`/api/v4/leads/${leadId}/links`, [
    { to_entity_id: contactId, to_entity_type: 'contacts' },
  ]);
  return res.data;
}

async function linkCompanyToLead(leadId, companyId) {
  await rateLimit();
  const res = await kommoClient.post(`/api/v4/leads/${leadId}/links`, [
    { to_entity_id: companyId, to_entity_type: 'companies' },
  ]);
  return res.data;
}

async function getCustomFields(entityType = 'leads') {
  await rateLimit();
  const res = await kommoClient.get(`/api/v4/${entityType}/custom_fields`);
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
  createNote,
  createNotesBatch,
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
