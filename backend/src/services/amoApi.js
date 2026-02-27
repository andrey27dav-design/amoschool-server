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
    pages: Math.ceil((res.data._total_items || 0) / limit),
  };
}

async function getAllLeads(pipelineId) {
  const allLeads = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const { leads, pages } = await getLeads(pipelineId, page);
    allLeads.push(...leads);
    logger.info(`AMO: fetched leads page ${page}/${pages}, total so far: ${allLeads.length}`);
    hasMore = page < pages;
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
    pages: Math.ceil((res.data._total_items || 0) / limit),
  };
}

async function getAllContacts() {
  const all = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const { contacts, pages } = await getContacts(page);
    all.push(...contacts);
    logger.info(`AMO: fetched contacts page ${page}/${pages}`);
    hasMore = page < pages;
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
    pages: Math.ceil((res.data._total_items || 0) / limit),
  };
}

async function getAllCompanies() {
  const all = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const { companies, pages } = await getCompanies(page);
    all.push(...companies);
    logger.info(`AMO: fetched companies page ${page}/${pages}`);
    hasMore = page < pages;
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
    pages: Math.ceil((res.data._total_items || 0) / limit),
  };
}

async function getAllTasks() {
  const all = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const { tasks, pages } = await getTasks(null, null, page);
    all.push(...tasks);
    logger.info(`AMO: fetched tasks page ${page}/${pages}`);
    hasMore = page < pages;
    page++;
  }

  return all;
}

async function getAllLeadTasks() {
  const all = [];
  let page = 1;
  while (true) {
    const { tasks, pages } = await getTasks('leads', null, page);
    all.push(...tasks);
    logger.info(`AMO: fetched lead tasks page ${page}/${pages}`);
    if (page >= pages) break;
    page++;
  }
  return all;
}

async function getAllContactTasks() {
  const all = [];
  let page = 1;
  while (true) {
    const { tasks, pages } = await getTasks('contacts', null, page);
    all.push(...tasks);
    logger.info(`AMO: fetched contact tasks page ${page}/${pages}`);
    if (page >= pages) break;
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
    const total = res.data._total_items || 0;
    const pages = Math.ceil(total / 250) || 1;
    all.push(...notes);
    logger.info(`AMO: fetched lead notes page ${page}/${pages}, count=${notes.length}`);
    if (page >= pages || notes.length < 250) break;
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
    const total = res.data._total_items || 0;
    const pages = Math.ceil(total / 250) || 1;
    all.push(...notes);
    logger.info(`AMO: fetched contact notes page ${page}/${pages}, count=${notes.length}`);
    if (page >= pages || notes.length < 250) break;
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
    pages: Math.ceil((res.data._total_items || 0) / limit),
  };
}

async function getLeadNotes(leadId) {
  const all = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const { notes, pages } = await getNotes('leads', leadId, page);
    all.push(...notes);
    hasMore = page < pages;
    page++;
  }
  return all;
}

async function getContactNotes(contactId) {
  const all = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const { notes, pages } = await getNotes('contacts', contactId, page);
    all.push(...notes);
    hasMore = page < pages;
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
