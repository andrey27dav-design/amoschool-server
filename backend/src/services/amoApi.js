const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

const amoClient = axios.create({
  baseURL: config.amo.baseUrl,
  headers: {
    Authorization: `Bearer ${config.amo.token}`,
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// ⛔ SAFETY: Block any DELETE/PUT/PATCH requests to AMO CRM API
// AMO is a READ-ONLY source — data is deleted manually by operator after verification
amoClient.interceptors.request.use((cfg) => {
  const method = (cfg.method || '').toLowerCase();
  if (method === 'delete' || method === 'put' || method === 'patch') {
    const msg = `[amoApi] SAFETY BLOCK: ${method.toUpperCase()} request to AMO CRM is FORBIDDEN. AMO is read-only source data.`;
    logger.error(msg, cfg.url);
    throw new Error(msg);
  }
  return cfg;
});

// Rate limiter: max 7 requests/sec for amo CRM API
let lastRequestTime = 0;
const MIN_INTERVAL = 150; // ms

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
  const res = await amoClient.get('/api/v4/leads/pipelines');
  return res.data._embedded?.pipelines || [];
}

async function getPipeline(pipelineId) {
  await rateLimit();
  const res = await amoClient.get(`/api/v4/leads/pipelines/${pipelineId}`);
  return res.data;
}

async function getLeads(pipelineId, page = 1, limit = 50) {
  await rateLimit();
  const res = await amoClient.get('/api/v4/leads', {
    params: {
      filter: { pipeline_id: pipelineId },
      page,
      limit,
      with: 'contacts,companies,tags',
    },
  });
  return {
    leads: res.data._embedded?.leads || [],
    total: res.data._total_items || 0,
    page,
    hasNext: !!res.data._links?.next,
  };
}

async function getAllLeads(pipelineId) {
  const allLeads = [];
  let page = 1;

  while (true) {
    const { leads, hasNext } = await getLeads(pipelineId, page);
    allLeads.push(...leads);
    logger.info(`AMO: fetched leads page ${page}, total so far: ${allLeads.length}`);
    if (!hasNext || leads.length === 0) break;
    page++;
  }

  return allLeads;
}

async function getContacts(page = 1, limit = 50) {
  await rateLimit();
  const res = await amoClient.get('/api/v4/contacts', {
    params: { page, limit, with: 'leads' },
  });
  return {
    contacts: res.data._embedded?.contacts || [],
    total: res.data._total_items || 0,
    hasNext: !!res.data._links?.next,
  };
}

async function getAllContacts() {
  const all = [];
  let page = 1;

  while (true) {
    const { contacts, hasNext } = await getContacts(page);
    all.push(...contacts);
    logger.info(`AMO: fetched contacts page ${page}`);
    if (!hasNext || contacts.length === 0) break;
    page++;
  }

  return all;
}

async function getCompanies(page = 1, limit = 50) {
  await rateLimit();
  const res = await amoClient.get('/api/v4/companies', {
    params: { page, limit },
  });
  return {
    companies: res.data._embedded?.companies || [],
    total: res.data._total_items || 0,
    hasNext: !!res.data._links?.next,
  };
}

async function getAllCompanies() {
  const all = [];
  let page = 1;

  while (true) {
    const { companies, hasNext } = await getCompanies(page);
    all.push(...companies);
    logger.info(`AMO: fetched companies page ${page}`);
    if (!hasNext || companies.length === 0) break;
    page++;
  }

  return all;
}

async function getTasks(entityType = 'leads', entityId = null, page = 1, limit = 50) {
  await rateLimit();
  const params = { page, limit };
  if (entityType) params.filter = { entity_type: entityType };
  if (entityId) params.filter = { ...params.filter, entity_id: entityId };

  const res = await amoClient.get('/api/v4/tasks', { params });
  return {
    tasks: res.data._embedded?.tasks || [],
    total: res.data._total_items || 0,
    hasNext: !!res.data._links?.next,
  };
}

async function getAllTasks() {
  const all = [];
  let page = 1;

  while (true) {
    const { tasks, hasNext } = await getTasks(null, null, page);
    all.push(...tasks);
    logger.info(`AMO: fetched tasks page ${page}`);
    if (!hasNext || tasks.length === 0) break;
    page++;
  }

  return all;
}

async function getAllLeadTasks() {
  const all = [];
  let page = 1;
  while (true) {
    const { tasks, hasNext } = await getTasks('leads', null, page);
    all.push(...tasks);
    logger.info(`AMO: fetched lead tasks page ${page}`);
    if (!hasNext || tasks.length === 0) break;
    page++;
  }
  return all;
}

async function getAllContactTasks() {
  const all = [];
  let page = 1;
  while (true) {
    const { tasks, hasNext } = await getTasks('contacts', null, page);
    all.push(...tasks);
    logger.info(`AMO: fetched contact tasks page ${page}`);
    if (!hasNext || tasks.length === 0) break;
    page++;
  }
  return all;
}

async function getAllLeadNotes() {
  const all = [];
  let page = 1;
  while (true) {
    await rateLimit();
    const res = await amoClient.get('/api/v4/leads/notes', { params: { page, limit: 250 } });
    const notes = res.data._embedded?.notes || [];
    const hasNext = !!res.data._links?.next;
    all.push(...notes);
    logger.info(`AMO: fetched lead notes page ${page}, count=${notes.length}`);
    if (!hasNext || notes.length === 0) break;
    page++;
  }
  return all;
}

async function getAllContactNotes() {
  const all = [];
  let page = 1;
  while (true) {
    await rateLimit();
    const res = await amoClient.get('/api/v4/contacts/notes', { params: { page, limit: 250 } });
    const notes = res.data._embedded?.notes || [];
    const hasNext = !!res.data._links?.next;
    all.push(...notes);
    logger.info(`AMO: fetched contact notes page ${page}, count=${notes.length}`);
    if (!hasNext || notes.length === 0) break;
    page++;
  }
  return all;
}

async function getNotes(entityType, entityId, page = 1, limit = 50) {
  await rateLimit();
  const res = await amoClient.get(`/api/v4/${entityType}/${entityId}/notes`, {
    params: { page, limit },
  });
  return {
    notes: res.data._embedded?.notes || [],
    total: res.data._total_items || 0,
    hasNext: !!res.data._links?.next,
  };
}

async function getLeadNotes(leadId) {
  const all = [];
  let page = 1;
  while (true) {
    const { notes, hasNext } = await getNotes('leads', leadId, page);
    all.push(...notes);
    if (!hasNext || notes.length === 0) break;
    page++;
  }
  return all;
}

async function getContactNotes(contactId) {
  const all = [];
  let page = 1;
  while (true) {
    const { notes, hasNext } = await getNotes('contacts', contactId, page);
    all.push(...notes);
    if (!hasNext || notes.length === 0) break;
    page++;
  }
  return all;
}

async function getCustomFields(entityType = 'leads') {
  await rateLimit();
  const res = await amoClient.get(`/api/v4/${entityType}/custom_fields`);
  return res.data._embedded?.custom_fields || [];
}

/**
 * Получает группы кастомных полей из AMO CRM для указанного типа сущности.
 * Группы используются для структурирования полей в UI (Основное, Технические и т.д.)
 */
async function getCustomFieldGroups(entityType = 'leads') {
  await rateLimit();
  const res = await amoClient.get(`/api/v4/${entityType}/custom_fields/groups`, {
    params: { limit: 250 }
  });
  return res.data._embedded?.custom_field_groups || [];
}

async function getUsers() {
  await rateLimit();
  const res = await amoClient.get('/api/v4/users', { params: { limit: 250 } });
  return res.data._embedded?.users || [];
}

module.exports = {
  getPipelines,
  getPipeline,
  getLeads,
  getAllLeads,
  getContacts,
  getAllContacts,
  getCompanies,
  getAllCompanies,
  getTasks,
  getAllTasks,
  getAllLeadTasks,
  getAllContactTasks,
  getNotes,
  getLeadNotes,
  getContactNotes,
  getAllLeadNotes,
  getAllContactNotes,
  getCustomFields,
  getCustomFieldGroups,
  getUsers,
};
