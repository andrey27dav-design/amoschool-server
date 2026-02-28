/**
 * Kommo CRM API client — for deal copying.
 * All calls are rate-limited and auto-retried.
 */
const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const { createRateLimiter } = require('../utils/rateLimiter');

const { execute } = createRateLimiter('Kommo');

const client = axios.create({
  baseURL: `${config.kommo.baseUrl}/api/v4`,
  headers: {
    Authorization: `Bearer ${config.kommo.token}`,
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

// ─── Users ────────────────────────────────────────────────────────────────────
async function getUsers() {
  return fetchAllPages('/users');
}

// ─── Contacts ─────────────────────────────────────────────────────────────────
/**
 * Search for existing contact by email/phone to avoid duplicates.
 */
async function findContactByEmail(email) {
  if (!email) return null;
  try {
    const res = await execute(
      () => client.get('/contacts', { params: { query: email, limit: 5 } }),
      `findContact(${email})`
    );
    const contacts = res.data?._embedded?.contacts || [];
    for (const c of contacts) {
      const fields = c.custom_fields_values || [];
      for (const f of fields) {
        const hasEmail = (f.values || []).some(
          (v) => v.value?.toLowerCase() === email.toLowerCase()
        );
        if (hasEmail) return c;
      }
    }
    // Also check by exact name match if email check fails
    return null;
  } catch {
    return null;
  }
}

/**
 * Create a single contact. Returns created contact.
 * NEVER modifies existing data.
 */
async function createContact(data) {
  const res = await execute(
    () => client.post('/contacts', [data]),
    `createContact(${data.name || '?'})`
  );
  const created = res.data?._embedded?.contacts?.[0];
  logger.info(`Kommo: Created contact id=${created?.id} name="${created?.name}"`);
  return created;
}

/**
 * Create multiple contacts in one request (batch).
 */
async function createContacts(items) {
  if (!items.length) return [];
  const res = await execute(
    () => client.post('/contacts', items),
    `createContacts(${items.length})`
  );
  return res.data?._embedded?.contacts || [];
}

// ─── Companies ────────────────────────────────────────────────────────────────
async function findCompanyByName(name) {
  if (!name) return null;
  try {
    const res = await execute(
      () => client.get('/companies', { params: { query: name, limit: 5 } }),
      `findCompany(${name})`
    );
    const companies = res.data?._embedded?.companies || [];
    return companies.find((c) => c.name?.toLowerCase() === name.toLowerCase()) || null;
  } catch {
    return null;
  }
}

async function createCompany(data) {
  const res = await execute(
    () => client.post('/companies', [data]),
    `createCompany(${data.name || '?'})`
  );
  const created = res.data?._embedded?.companies?.[0];
  logger.info(`Kommo: Created company id=${created?.id} name="${created?.name}"`);
  return created;
}

// ─── Leads ────────────────────────────────────────────────────────────────────
/**
 * Check if lead with given amo_id already exists in Kommo
 * by searching in a special custom field "amo_id".
 * Returns kommo lead or null.
 */
async function findLeadByAmoId(amoId, amoIdFieldId) {
  if (!amoIdFieldId) return null;
  try {
    const res = await execute(
      () => client.get('/leads', {
        params: {
          [`filter[custom_fields_values][${amoIdFieldId}][values][0][value]`]: String(amoId),
          limit: 5,
        },
      }),
      `findLeadByAmoId(${amoId})`
    );
    return res.data?._embedded?.leads?.[0] || null;
  } catch {
    return null;
  }
}

async function createLead(data) {
  const res = await execute(
    () => client.post('/leads', [data]),
    `createLead(${data.name || '?'})`
  );
  const created = res.data?._embedded?.leads?.[0];
  logger.info(`Kommo: Created lead id=${created?.id} name="${created?.name}"`);
  return created;
}

/**
 * Link contacts and/or company to a lead.
 */
async function linkLeadEntities(leadId, contactIds = [], companyId = null) {
  const links = [];
  for (const cId of contactIds) {
    links.push({ to_entity_id: cId, to_entity_type: 'contacts' });
  }
  if (companyId) {
    links.push({ to_entity_id: companyId, to_entity_type: 'companies' });
  }
  if (!links.length) return;
  await execute(
    () => client.post(`/leads/${leadId}/link`, links),
    `linkLead(${leadId})`
  );
}

/**
 * Delete a lead (for rollback). ONLY deletes in Kommo.
 */
async function deleteLead(leadId) {
  await execute(
    () => client.delete(`/leads/${leadId}`),
    `deleteLead(${leadId})`
  );
  logger.info(`Kommo: Deleted lead ${leadId} (rollback)`);
}

async function deleteContact(contactId) {
  await execute(
    () => client.delete(`/contacts/${contactId}`),
    `deleteContact(${contactId})`
  );
  logger.info(`Kommo: Deleted contact ${contactId} (rollback)`);
}

async function deleteCompany(companyId) {
  await execute(
    () => client.delete(`/companies/${companyId}`),
    `deleteCompany(${companyId})`
  );
  logger.info(`Kommo: Deleted company ${companyId} (rollback)`);
}

// ─── Notes ────────────────────────────────────────────────────────────────────
async function createLeadNote(leadId, noteData) {
  const res = await execute(
    () => client.post(`/leads/${leadId}/notes`, [noteData]),
    `createLeadNote(${leadId})`
  );
  return res.data?._embedded?.notes?.[0] || null;
}

async function createContactNote(contactId, noteData) {
  const res = await execute(
    () => client.post(`/contacts/${contactId}/notes`, [noteData]),
    `createContactNote(${contactId})`
  );
  return res.data?._embedded?.notes?.[0] || null;
}

async function deleteNote(entityType, entityId, noteId) {
  await execute(
    () => client.delete(`/${entityType}/${entityId}/notes/${noteId}`),
    `deleteNote(${entityType}/${entityId}/${noteId})`
  );
}

// ─── Tasks ────────────────────────────────────────────────────────────────────
async function createTask(taskData) {
  const res = await execute(
    () => client.post('/tasks', [taskData]),
    `createTask`
  );
  return res.data?._embedded?.tasks?.[0] || null;
}

async function deleteTask(taskId) {
  await execute(
    () => client.delete(`/tasks/${taskId}`),
    `deleteTask(${taskId})`
  );
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


/**
 * Patch custom fields of an existing lead (re-fill missing fields).
 */
async function updateLeadFields(leadId, customFieldsValues) {
  if (!customFieldsValues || customFieldsValues.length === 0) return;
  const res = await execute(
    () => client.patch(`/leads/${leadId}`, { custom_fields_values: customFieldsValues }),
    `updateLeadFields(${leadId})`
  );
  logger.info(`Kommo: updateLeadFields lead=${leadId} fields=${customFieldsValues.length}`);
  return res;
}

module.exports = {
  getPipelines,
  getUsers,
  findContactByEmail,
  createContact,
  createContacts,
  findCompanyByName,
  createCompany,
  findLeadByAmoId,
  createLead,
  linkLeadEntities,
  deleteLead,
  deleteContact,
  deleteCompany,
  createLeadNote,
  createContactNote,
  deleteNote,
  createTask,
  deleteTask,
  getLeadCustomFields,
  getContactCustomFields,
  getCompanyCustomFields,
  updateLeadFields,
};
