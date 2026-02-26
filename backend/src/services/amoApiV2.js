/**
 * AMO CRM API client — enhanced version for deal copying.
 * All calls are rate-limited and auto-retried.
 */
const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const { createRateLimiter } = require('../utils/rateLimiter');

const { execute } = createRateLimiter('AMO');

const client = axios.create({
  baseURL: `${config.amo.baseUrl}/api/v4`,
  headers: {
    Authorization: `Bearer ${config.amo.token}`,
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Generic paginated fetcher
async function fetchAllPages(endpoint, params = {}) {
  const all = [];
  let page = 1;
  while (true) {
    const res = await execute(
      () => client.get(endpoint, { params: { ...params, page, limit: 250 } }),
      `${endpoint} page ${page}`
    );
    const embedded = res.data?._embedded;
    const key = Object.keys(embedded || {})[0];
    const items = embedded?.[key] || [];
    all.push(...items);
    if (items.length < 250) break;
    page++;
  }
  return all;
}

// ─── Pipelines ────────────────────────────────────────────────────────────────
async function getPipelines() {
  const res = await execute(() => client.get('/leads/pipelines'), 'getPipelines');
  return res.data._embedded?.pipelines || [];
}

async function getPipeline(id) {
  const res = await execute(() => client.get(`/leads/pipelines/${id}`), `getPipeline(${id})`);
  return res.data;
}

// ─── Users & Groups ──────────────────────────────────────────────────────────
async function getUsers() {
  return fetchAllPages('/users');
}

async function getGroups() {
  try {
    const res = await execute(() => client.get('/users/groups'), 'getGroups');
    return res.data._embedded?.groups || [];
  } catch (err) {
    logger.warn(`AMO getGroups failed: ${err.message}`);
    return [];
  }
}

// Hardcoded manager emails for "Международный ОП"
const MEZHDUNARODNY_EMAILS = [
  'admdir@houch-school.ru',
  'Manager20@houch-school.ru',
  'Manager15@houch-school.ru',
];

/**
 * Returns all users that belong to the group named "Международный ОП".
 * Falls back to matching by hardcoded email list.
 */
async function getMezhdunarodniyOPUsers() {
  const users = await getUsers();

  // Try dynamic group resolution first
  const groups = await getGroups();
  if (groups.length > 0) {
    const group = groups.find(
      (g) => g.name?.toLowerCase().includes('международн')
        || g.name?.toLowerCase().includes('mezhdunar')
    );
    if (group) {
      const groupId = group.id;
      const groupUsers = users.filter((u) =>
        u.group_id === groupId ||
        (Array.isArray(u.groups) && u.groups.some((gr) => gr.id === groupId)) ||
        (Array.isArray(u._embedded?.groups) && u._embedded.groups.some((gr) => gr.id === groupId))
      );
      if (groupUsers.length > 0) {
        logger.info(`AMO: Group "${group.name}" has ${groupUsers.length} users`);
        return groupUsers;
      }
    }
  }

  // Fallback: match by hardcoded emails
  logger.info('AMO: Using hardcoded email list for Международный ОП');
  const matched = users.filter((u) =>
    MEZHDUNARODNY_EMAILS.map((e) => e.toLowerCase()).includes(u.email?.toLowerCase())
  );
  if (matched.length > 0) return matched;

  // Last resort: return all active users
  logger.warn('AMO: No Международный ОП users found — returning all active users');
  return users.filter((u) => u.is_active !== false);
}


// ─── Leads ────────────────────────────────────────────────────────────────────
/**
 * Get all leads of a specific user in a specific pipeline.
 */
async function getLeadsByUserAndPipeline(pipelineId, userId) {
  const all = [];
  let page = 1;
  while (true) {
    const res = await execute(
      () => client.get('/leads', {
        params: {
          'filter[pipeline_id]': pipelineId,
          'filter[responsible_user_id]': userId,
          with: 'contacts,companies,loss_reason',
          page,
          limit: 250,
        },
      }),
      `leads page ${page} user=${userId}`
    );
    const leads = res.data?._embedded?.leads || [];
    all.push(...leads);
    if (leads.length < 250) break;
    page++;
  }
  logger.info(`AMO: Fetched ${all.length} leads for user ${userId} in pipeline ${pipelineId}`);
  return all;
}

async function getLead(id) {
  const res = await execute(
    () => client.get(`/leads/${id}`, { params: { with: 'contacts,companies,loss_reason' } }),
    `getLead(${id})`
  );
  return res.data;
}

// ─── Contacts ─────────────────────────────────────────────────────────────────
async function getContactsByIds(ids) {
  if (!ids.length) return [];
  const chunks = chunkArray(ids, 50);
  const all = [];
  for (const chunk of chunks) {
    const res = await execute(
      () => client.get('/contacts', {
        params: {
          'filter[id]': chunk.join(','),
          with: 'leads',
          limit: 250,
        },
      }),
      `getContacts(${chunk.length})`
    );
    all.push(...(res.data?._embedded?.contacts || []));
  }
  return all;
}

async function getContact(id) {
  const res = await execute(
    () => client.get(`/contacts/${id}`),
    `getContact(${id})`
  );
  return res.data;
}

// ─── Companies ────────────────────────────────────────────────────────────────
async function getCompaniesByIds(ids) {
  if (!ids.length) return [];
  const chunks = chunkArray(ids, 50);
  const all = [];
  for (const chunk of chunks) {
    const res = await execute(
      () => client.get('/companies', {
        params: { 'filter[id]': chunk.join(','), limit: 250 },
      }),
      `getCompanies(${chunk.length})`
    );
    all.push(...(res.data?._embedded?.companies || []));
  }
  return all;
}

// ─── Timeline (notes, tasks, calls) ─────────────────────────────────────────
async function getLeadNotes(leadId) {
  const res = await execute(
    () => client.get(`/leads/${leadId}/notes`, { params: { limit: 250 } }),
    `leadNotes(${leadId})`
  );
  return res.data?._embedded?.notes || [];
}

async function getContactNotes(contactId) {
  const res = await execute(
    () => client.get(`/contacts/${contactId}/notes`, { params: { limit: 250 } }),
    `contactNotes(${contactId})`
  );
  return res.data?._embedded?.notes || [];
}

async function getLeadTasks(leadId) {
  const res = await execute(
    () => client.get('/tasks', {
      params: {
        'filter[entity_type]': 'leads',
        'filter[entity_id]': leadId,
        limit: 250,
      },
    }),
    `leadTasks(${leadId})`
  );
  return res.data?._embedded?.tasks || [];
}

async function getContactTasks(contactId) {
  const res = await execute(
    () => client.get('/tasks', {
      params: {
        'filter[entity_type]': 'contacts',
        'filter[entity_id]': contactId,
        limit: 250,
      },
    }),
    `contactTasks(${contactId})`
  );
  return res.data?._embedded?.tasks || [];
}

/**
 * Get full timeline for a lead: notes + tasks
 */
async function getLeadTimeline(leadId) {
  const [notes, tasks] = await Promise.all([
    getLeadNotes(leadId),
    getLeadTasks(leadId),
  ]);
  return { notes, tasks };
}

// ─── Custom fields ────────────────────────────────────────────────────────────
async function getLeadCustomFields() {
  return fetchAllPages('/leads/custom_fields');
}

async function getContactCustomFields() {
  return fetchAllPages('/contacts/custom_fields');
}

async function getCompanyCustomFields() {
  return fetchAllPages('/companies/custom_fields');
}

// ─── Utility ─────────────────────────────────────────────────────────────────
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

module.exports = {
  getPipelines,
  getPipeline,
  getUsers,
  getGroups,
  getMezhdunarodniyOPUsers,
  getLeadsByUserAndPipeline,
  getLead,
  getContactsByIds,
  getContact,
  getCompaniesByIds,
  getLeadNotes,
  getContactNotes,
  getLeadTasks,
  getContactTasks,
  getLeadTimeline,
  getLeadCustomFields,
  getContactCustomFields,
  getCompanyCustomFields,
};
