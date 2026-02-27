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

async function getLeads(pipelineId, page = 1, limit = 50, managerIds = []) {
  await rateLimit();
  const filter = { pipeline_id: pipelineId };
  if (Array.isArray(managerIds) && managerIds.length > 0) {
    filter.responsible_user_id = managerIds;
  }
  const res = await amoClient.get('/api/v4/leads', {
    params: {
      filter,
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

async function getAllLeads(pipelineId, managerIds = []) {
  const allLeads = [];
  let page = 1;

  while (true) {
    const { leads, hasNext } = await getLeads(pipelineId, page, 50, managerIds);
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

// Fetch contacts only by specific IDs (batch by 50) — avoids loading all 24k+ contacts
async function getContactsByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const allContacts = [];
  const batchSize = 50;
  const idArray = Array.from(ids);
  for (let i = 0; i < idArray.length; i += batchSize) {
    const batch = idArray.slice(i, i + batchSize);
    await rateLimit();
    const res = await amoClient.get('/api/v4/contacts', {
      params: { filter: { id: batch }, limit: batchSize, with: 'leads' },
    });
    const contacts = res.data._embedded?.contacts || [];
    allContacts.push(...contacts);
    logger.info(`AMO: fetched ${contacts.length} contacts by ID (batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(idArray.length / batchSize)})`);
  }
  return allContacts;
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

// Fetch companies only by specific IDs (batch by 50)
async function getCompaniesByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const allCompanies = [];
  const batchSize = 50;
  const idArray = Array.from(ids);
  for (let i = 0; i < idArray.length; i += batchSize) {
    const batch = idArray.slice(i, i + batchSize);
    await rateLimit();
    const res = await amoClient.get('/api/v4/companies', {
      params: { filter: { id: batch }, limit: batchSize },
    });
    const companies = res.data._embedded?.companies || [];
    allCompanies.push(...companies);
    logger.info(`AMO: fetched ${companies.length} companies by ID (batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(idArray.length / batchSize)})`);
  }
  return allCompanies;
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

// Fetch lead tasks only for specific entity IDs (batch by 50)
async function getLeadTasksByEntityIds(entityIds) {
  if (!entityIds || entityIds.length === 0) return [];
  const allTasks = [];
  const batchSize = 50;
  const idArray = Array.from(entityIds);
  for (let i = 0; i < idArray.length; i += batchSize) {
    const batch = idArray.slice(i, i + batchSize);
    await rateLimit();
    const res = await amoClient.get('/api/v4/tasks', {
      params: { filter: { entity_type: 'leads', entity_id: batch }, limit: 250 },
    });
    const tasks = res.data._embedded?.tasks || [];
    allTasks.push(...tasks);
    // handle pagination per batch
    let hasNext = !!res.data._links?.next;
    let page = 2;
    while (hasNext) {
      await rateLimit();
      const r2 = await amoClient.get('/api/v4/tasks', {
        params: { filter: { entity_type: 'leads', entity_id: batch }, limit: 250, page },
      });
      const more = r2.data._embedded?.tasks || [];
      allTasks.push(...more);
      hasNext = !!r2.data._links?.next;
      page++;
    }
    logger.info(`AMO: fetched lead tasks batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(idArray.length / batchSize)}`);
  }
  return allTasks;
}

// Fetch contact tasks only for specific entity IDs (batch by 50)
async function getContactTasksByEntityIds(entityIds) {
  if (!entityIds || entityIds.length === 0) return [];
  const allTasks = [];
  const batchSize = 50;
  const idArray = Array.from(entityIds);
  for (let i = 0; i < idArray.length; i += batchSize) {
    const batch = idArray.slice(i, i + batchSize);
    await rateLimit();
    const res = await amoClient.get('/api/v4/tasks', {
      params: { filter: { entity_type: 'contacts', entity_id: batch }, limit: 250 },
    });
    const tasks = res.data._embedded?.tasks || [];
    allTasks.push(...tasks);
    let hasNext = !!res.data._links?.next;
    let page = 2;
    while (hasNext) {
      await rateLimit();
      const r2 = await amoClient.get('/api/v4/tasks', {
        params: { filter: { entity_type: 'contacts', entity_id: batch }, limit: 250, page },
      });
      const more = r2.data._embedded?.tasks || [];
      allTasks.push(...more);
      hasNext = !!r2.data._links?.next;
      page++;
    }
    logger.info(`AMO: fetched contact tasks batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(idArray.length / batchSize)}`);
  }
  return allTasks;
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

// Fetch lead notes only for specific entity IDs (batch by 50)
async function getLeadNotesByEntityIds(entityIds) {
  if (!entityIds || entityIds.length === 0) return [];
  const allNotes = [];
  const batchSize = 50;
  const idArray = Array.from(entityIds);
  for (let i = 0; i < idArray.length; i += batchSize) {
    const batch = idArray.slice(i, i + batchSize);
    let page = 1;
    while (true) {
      await rateLimit();
      const res = await amoClient.get('/api/v4/leads/notes', {
        params: { filter: { entity_id: batch }, limit: 250, page },
      });
      const notes = res.data._embedded?.notes || [];
      const hasNext = !!res.data._links?.next;
      allNotes.push(...notes);
      if (!hasNext || notes.length === 0) break;
      page++;
    }
    logger.info(`AMO: fetched lead notes for batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(idArray.length / batchSize)}`);
  }
  return allNotes;
}

// Fetch contact notes only for specific entity IDs (batch by 50)
async function getContactNotesByEntityIds(entityIds) {
  if (!entityIds || entityIds.length === 0) return [];
  const allNotes = [];
  const batchSize = 50;
  const idArray = Array.from(entityIds);
  for (let i = 0; i < idArray.length; i += batchSize) {
    const batch = idArray.slice(i, i + batchSize);
    let page = 1;
    while (true) {
      await rateLimit();
      const res = await amoClient.get('/api/v4/contacts/notes', {
        params: { filter: { entity_id: batch }, limit: 250, page },
      });
      const notes = res.data._embedded?.notes || [];
      const hasNext = !!res.data._links?.next;
      allNotes.push(...notes);
      if (!hasNext || notes.length === 0) break;
      page++;
    }
    logger.info(`AMO: fetched contact notes for batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(idArray.length / batchSize)}`);
  }
  return allNotes;
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
  getContactsByIds,
  getCompanies,
  getAllCompanies,
  getCompaniesByIds,
  getTasks,
  getAllTasks,
  getAllLeadTasks,
  getAllContactTasks,
  getLeadTasksByEntityIds,
  getContactTasksByEntityIds,
  getNotes,
  getLeadNotes,
  getContactNotes,
  getAllLeadNotes,
  getAllContactNotes,
  getLeadNotesByEntityIds,
  getContactNotesByEntityIds,
  getCustomFields,
  getCustomFieldGroups,
  getUsers,
};
