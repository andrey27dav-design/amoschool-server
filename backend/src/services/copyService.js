/**
 * Core deal copy service.
 * Orchestrates: fetch → create contacts → create companies → create deals → copy timeline
 * All state is persisted to SQLite for rollback support.
 */
const fs = require('fs-extra');
const path = require('path');
const amo  = require('./amoApiV2');
const kommo = require('./kommoApiV2');
const db   = require('../db');
const logger = require('../utils/logger');

// ─── User mapping AMO email → Kommo user ID ───────────────────────────────────
// Set at session creation via route parameter; can also use this default map.
const DEFAULT_USER_MAP = [
  { amoEmail: 'admdir@houch-school.ru',   kommoEmail: 'Dariiiaaayyyaaa@gmail.com' },
  { amoEmail: 'Manager20@houch-school.ru', kommoEmail: 'chaplygina.d@inbox.ru' },
  { amoEmail: 'Manager15@houch-school.ru', kommoEmail: 'vvarvaravv7@gmail.com' },
  // fallback: regi.shkola@gmail.com (Olga)
];
const FALLBACK_KOMMO_EMAIL = 'regi.shkola@gmail.com';

// ─── SSE progress emitter ─────────────────────────────────────────────────────
// Map of sessionId → res (SSE response)
const sseClients = new Map();

function registerSSE(sessionId, res) {
  sseClients.set(sessionId, res);
}

function unregisterSSE(sessionId) {
  sseClients.delete(sessionId);
}

function emitProgress(sessionId, event) {
  const res = sseClients.get(sessionId);
  if (!res) return;
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

// ─── Resolve Kommo user ID for AMO user ──────────────────────────────────────
async function resolveKommoUserId(amoUser, kommoUsers, userMapOverride = null) {
  const map = userMapOverride || DEFAULT_USER_MAP;
  const amoEmail = amoUser.email?.toLowerCase();

  const mapping = map.find((m) => m.amoEmail?.toLowerCase() === amoEmail);
  const targetEmail = mapping ? mapping.kommoEmail : FALLBACK_KOMMO_EMAIL;

  const kommoUser = kommoUsers.find(
    (u) => u.email?.toLowerCase() === targetEmail.toLowerCase()
  );
  if (!kommoUser) {
    logger.warn(`Kommo user not found for email "${targetEmail}", will use fallback`);
    const fallback = kommoUsers.find(
      (u) => u.email?.toLowerCase() === FALLBACK_KOMMO_EMAIL.toLowerCase()
    );
    return fallback?.id || kommoUsers[0]?.id;
  }
  return kommoUser.id;
}

// ─── Load field mapping ───────────────────────────────────────────────────────
let _fieldMapping = null;
function getFieldMapping() {
  if (!_fieldMapping) {
    const p = path.join(__dirname, '../../../backups/field_mapping.json');
    _fieldMapping = JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  return _fieldMapping;
}

// ─── Transform custom fields ─────────────────────────────────────────────────
function transformCustomFields(amoFields, section) {
  const mapping = getFieldMapping()[section] || {};
  const result = [];

  for (const field of (amoFields || [])) {
    const fieldId = String(field.field_id);
    const entry = mapping[fieldId];
    if (!entry || !entry.kommoFieldId) continue;

    const kommoFieldId = entry.kommoFieldId;
    const mode = entry.transferMode || 'direct';

    if (mode === 'direct') {
      result.push({ field_id: kommoFieldId, values: field.values });
    } else if (mode === 'first_value') {
      const first = field.values?.[0];
      if (!first) continue;
      // Translate enum value
      const enumMap = entry.enumMap || {};
      const amoEnumId = String(first.enum_id || first.value);
      const kommoEnumId = enumMap[amoEnumId];
      if (kommoEnumId) {
        result.push({ field_id: kommoFieldId, values: [{ enum_id: kommoEnumId }] });
      } else {
        // Fall back to value as text
        result.push({ field_id: kommoFieldId, values: [{ value: first.value }] });
      }
    } else if (mode === 'as_text') {
      const text = field.values?.map((v) => v.value).join(', ');
      if (text) result.push({ field_id: kommoFieldId, values: [{ value: text }] });
    }
  }

  return result;
}

// ─── Transform multitext (phone/email) ───────────────────────────────────────
function transformMultitext(amoField, kommoFieldId, enumMap) {
  if (!amoField?.values?.length) return null;
  const values = amoField.values.map((v) => {
    const kommoEnumId = enumMap[String(v.enum_id || v.enum)] || null;
    return { value: v.value, enum_id: kommoEnumId, enum: v.enum };
  });
  return { field_id: kommoFieldId, values };
}

// ─── Find or create Kommo contact ─────────────────────────────────────────────
async function findOrCreateContact(amoContact, sessionId, kommoUserId) {
  // Check if already mapped in this session
  const existing = db.resolveKommoId(sessionId, 'contact', amoContact.id);
  if (existing) return existing;

  // Check mapping table for email
  const mapping = getFieldMapping().contacts || {};
  const emailFieldId = Object.entries(mapping).find(([, v]) => v.amoFieldName === 'Email')?.[0];
  const emailField = amoContact.custom_fields_values?.find((f) => String(f.field_id) === emailFieldId);
  const email = emailField?.values?.[0]?.value;

  // Try to find existing in Kommo by email
  let kommoContact = email ? await kommo.findContactByEmail(email) : null;

  if (kommoContact) {
    db.setMapping(sessionId, 'contact', amoContact.id, kommoContact.id, 'skipped');
    db.log(sessionId, 'info', `Contact ${amoContact.id} already exists in Kommo as ${kommoContact.id} (by email)`);
    return kommoContact.id;
  }

  // Create new contact
  const customFields = transformCustomFields(amoContact.custom_fields_values, 'contacts');

  const payload = {
    name: amoContact.name || 'Unnamed',
    responsible_user_id: kommoUserId,
    custom_fields_values: customFields.length ? customFields : undefined,
  };

  try {
    const created = await kommo.createContact(payload);
    db.setMapping(sessionId, 'contact', amoContact.id, created.id, 'created');
    db.log(sessionId, 'info', `Created contact amo=${amoContact.id} → kommo=${created.id}`);
    return created.id;
  } catch (err) {
    db.setMapping(sessionId, 'contact', amoContact.id, null, 'error', err.message);
    db.log(sessionId, 'error', `Failed to create contact ${amoContact.id}: ${err.message}`);
    throw err;
  }
}

// ─── Find or create Kommo company ─────────────────────────────────────────────
async function findOrCreateCompany(amoCompany, sessionId, kommoUserId) {
  if (!amoCompany) return null;
  const existing = db.resolveKommoId(sessionId, 'company', amoCompany.id);
  if (existing) return existing;

  let kommoCompany = await kommo.findCompanyByName(amoCompany.name);

  if (kommoCompany) {
    db.setMapping(sessionId, 'company', amoCompany.id, kommoCompany.id, 'skipped');
    return kommoCompany.id;
  }

  const customFields = transformCustomFields(amoCompany.custom_fields_values, 'companies');
  const payload = {
    name: amoCompany.name || 'Unknown Company',
    responsible_user_id: kommoUserId,
    custom_fields_values: customFields.length ? customFields : undefined,
  };

  try {
    const created = await kommo.createCompany(payload);
    db.setMapping(sessionId, 'company', amoCompany.id, created.id, 'created');
    db.log(sessionId, 'info', `Created company amo=${amoCompany.id} → kommo=${created.id}`);
    return created.id;
  } catch (err) {
    db.setMapping(sessionId, 'company', amoCompany.id, null, 'error', err.message);
    db.log(sessionId, 'error', `Failed to create company ${amoCompany.id}: ${err.message}`);
    return null; // Company is optional — don't fail the deal
  }
}

// ─── Copy timeline ─────────────────────────────────────────────────────────────
const NOTE_TYPE_MAP = {
  4: 4,  // common note
  2: 2,  // contact note (incoming call)
  3: 3,  // outgoing call
  10: 10, // email in
  11: 11, // email out
  13: 13, // SMS
  25: 25, // extended
  102: 4, // system → common
};

async function copyTimeline(amoLeadId, kommoLeadId, sessionId) {
  const { notes, tasks } = await amo.getLeadTimeline(amoLeadId);

  for (const note of notes) {
    try {
      const noteType = NOTE_TYPE_MAP[note.note_type] || 4;
      const payload = {
        note_type: noteType,
        params: note.params || { text: note.text || '' },
        created_at: note.created_at,
        updated_at: note.updated_at,
      };
      const created = await kommo.createLeadNote(kommoLeadId, payload);
      if (created?.id) {
        db.setMapping(sessionId, 'note', note.id, created.id, 'created');
      }
    } catch (err) {
      db.log(sessionId, 'warn', `Failed to copy note ${note.id}: ${err.message}`);
    }
  }

  for (const task of tasks) {
    try {
      const payload = {
        text: task.text || '',
        complete_till: task.complete_till,
        task_type_id: task.task_type_id,
        entity_id: kommoLeadId,
        entity_type: 'leads',
        responsible_user_id: task.responsible_user_id,
        is_completed: task.is_completed,
        created_at: task.created_at,
      };
      const created = await kommo.createTask(payload);
      if (created?.id) {
        db.setMapping(sessionId, 'task', task.id, created.id, 'created');
      }
    } catch (err) {
      db.log(sessionId, 'warn', `Failed to copy task ${task.id}: ${err.message}`);
    }
  }
}

// ─── Build stage mapping ───────────────────────────────────────────────────────
async function buildStageMapping(amoPipelineId, kommoPipelineId) {
  const [amoPipelines, kommoPipelines] = await Promise.all([
    amo.getPipeline(amoPipelineId).catch(() => null),
    kommo.getPipelines().catch(() => []),
  ]);

  const amoStages = amoPipelines?._embedded?.statuses || [];
  const kommoPipeline = kommoPipelines.find((p) => p.id === kommoPipelineId);
  const kommoStages = kommoPipeline?._embedded?.statuses || [];

  const mapping = {}; // amoStageId → kommoStageId

  for (const aStage of amoStages) {
    if (aStage.id === 142 || aStage.id === 143) continue; // system win/loss
    const match = kommoStages.find(
      (ks) => ks.name?.trim().toLowerCase() === aStage.name?.trim().toLowerCase()
    );
    if (match) {
      mapping[aStage.id] = match.id;
    } else {
      logger.warn(`Stage not matched: "${aStage.name}" (amo ${aStage.id})`);
    }
  }

  // Map win/loss system stages
  const kommoWin  = kommoStages.find((s) => s.type === 'won')?.id;
  const kommoLoss = kommoStages.find((s) => s.type === 'failed' || s.type === 'closed')?.id;
  if (kommoWin)  mapping[142] = kommoWin;
  if (kommoLoss) mapping[143] = kommoLoss;

  return { mapping, amoStages, kommoStages };
}

// ─── AMO ID field in Kommo (for duplicate detection) ─────────────────────────
let _amoIdKommoFieldId = null;
async function getAmoIdFieldId() {
  if (_amoIdKommoFieldId !== null) return _amoIdKommoFieldId;
  const fields = await kommo.getLeadCustomFields();
  const f = fields.find(
    (f) => f.name?.toLowerCase() === 'amo_id' || f.code?.toLowerCase() === 'amo_id'
  );
  _amoIdKommoFieldId = f?.id || null;
  return _amoIdKommoFieldId;
}

// ─── Copy a single deal ────────────────────────────────────────────────────────
async function copyDeal(amoLead, session, stageMapping, kommoUsers) {
  const sessionId = session.id;
  const amoLeadId = amoLead.id;

  // Skip if already copied
  const existingMapping = db.getMapping(sessionId, 'lead', amoLeadId);
  if (existingMapping?.status === 'created') {
    return { skipped: true, reason: 'already_copied', kommoId: existingMapping.kommo_id };
  }

  // Check for duplicate in Kommo by amo_id field
  const amoIdField = await getAmoIdFieldId();
  if (amoIdField) {
    const existing = await kommo.findLeadByAmoId(amoLeadId, amoIdField);
    if (existing) {
      db.setMapping(sessionId, 'lead', amoLeadId, existing.id, 'skipped');
      db.log(sessionId, 'info', `Lead ${amoLeadId} already exists in Kommo as ${existing.id} (amo_id field)`);
      return { skipped: true, reason: 'exists_in_kommo', kommoId: existing.id };
    }
  }

  // Resolve contacts
  const contactIds = [];
  const amoContacts = amoLead._embedded?.contacts || [];
  const cachedContacts = amoContacts.length > 0
    ? db.getCached(sessionId, 'contact').filter((c) => amoContacts.some((ac) => ac.id === c.id))
    : [];

  for (const amoContact of cachedContacts) {
    try {
      const kommoContactId = await findOrCreateContact(amoContact, sessionId, session.kommo_user_id);
      if (kommoContactId) contactIds.push(kommoContactId);
    } catch (err) {
      db.log(sessionId, 'warn', `Contact ${amoContact.id} failed: ${err.message}`);
    }
  }

  // Resolve company
  let kommoCompanyId = null;
  const amoCompanies = amoLead._embedded?.companies || [];
  if (amoCompanies.length > 0) {
    const cachedCompany = db.getCacheItem(sessionId, 'company', amoCompanies[0].id);
    if (cachedCompany) {
      kommoCompanyId = await findOrCreateCompany(cachedCompany, sessionId, session.kommo_user_id).catch(() => null);
    }
  }

  // Map stage
  const amoStageId = amoLead.status_id;
  const kommoStageId = stageMapping[amoStageId];
  if (!kommoStageId && amoStageId !== 142 && amoStageId !== 143) {
    db.log(sessionId, 'warn', `Stage ${amoStageId} not mapped for lead ${amoLeadId}`);
  }

  // Build custom fields
  let customFields = transformCustomFields(amoLead.custom_fields_values, 'leads');

  // Add amo_id service field
  if (amoIdField) {
    customFields.push({ field_id: amoIdField, values: [{ value: String(amoLeadId) }] });
  }

  // Build lead payload
  const payload = {
    name: amoLead.name || `Lead ${amoLeadId}`,
    responsible_user_id: session.kommo_user_id,
    pipeline_id: session.kommo_pipeline_id,
    status_id: kommoStageId || undefined,
    price: amoLead.price || 0,
    custom_fields_values: customFields.length ? customFields : undefined,
    created_at: amoLead.created_at,
  };

  // Handle closed deals
  if (amoLead.status_id === 142) payload.closed_at = amoLead.closed_at;
  if (amoLead.status_id === 143) payload.closed_at = amoLead.closed_at;

  try {
    const created = await kommo.createLead(payload);
    db.setMapping(sessionId, 'lead', amoLeadId, created.id, 'created');
    db.log(sessionId, 'info', `Created lead amo=${amoLeadId} → kommo=${created.id}`);

    // Link contacts and company
    await kommo.linkLeadEntities(created.id, contactIds, kommoCompanyId);

    // Copy timeline
    await copyTimeline(amoLeadId, created.id, sessionId);

    return { success: true, kommoId: created.id };
  } catch (err) {
    db.setMapping(sessionId, 'lead', amoLeadId, null, 'error', err.message);
    db.log(sessionId, 'error', `Failed to create lead ${amoLeadId}: ${err.message}`);
    throw err;
  }
}

// ─── Main: fetch all data for a session ─────────────────────────────────────
async function fetchSessionData(sessionId) {
  const session = db.getSession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  db.patchSessionStatus(sessionId, 'fetching');
  emitProgress(sessionId, { type: 'status', status: 'fetching', message: 'Выгружаем данные из AMO...' });

  try {
    // 1. Fetch all leads for user in pipeline
    db.log(sessionId, 'info', 'Fetching leads from AMO...');
    emitProgress(sessionId, { type: 'step', step: 'leads', message: 'Выгружаем сделки...' });
    const leads = await amo.getLeadsByUserAndPipeline(session.amo_pipeline_id, session.amo_user_id);
    db.cacheEntities(sessionId, 'lead', leads);
    emitProgress(sessionId, { type: 'step', step: 'leads', message: `Выгружено ${leads.length} сделок`, count: leads.length });

    // 2. Collect all unique contact IDs
    const contactIdSet = new Set();
    const companyIdSet = new Set();
    for (const lead of leads) {
      for (const c of lead._embedded?.contacts || []) contactIdSet.add(c.id);
      for (const c of lead._embedded?.companies || []) companyIdSet.add(c.id);
    }

    // 3. Fetch contacts
    if (contactIdSet.size > 0) {
      db.log(sessionId, 'info', `Fetching ${contactIdSet.size} contacts...`);
      emitProgress(sessionId, { type: 'step', step: 'contacts', message: `Выгружаем ${contactIdSet.size} контактов...` });
      const contacts = await amo.getContactsByIds([...contactIdSet]);
      db.cacheEntities(sessionId, 'contact', contacts);
      emitProgress(sessionId, { type: 'step', step: 'contacts', message: `Выгружено ${contacts.length} контактов`, count: contacts.length });
    }

    // 4. Fetch companies
    if (companyIdSet.size > 0) {
      db.log(sessionId, 'info', `Fetching ${companyIdSet.size} companies...`);
      emitProgress(sessionId, { type: 'step', step: 'companies', message: `Выгружаем ${companyIdSet.size} компаний...` });
      const companies = await amo.getCompaniesByIds([...companyIdSet]);
      db.cacheEntities(sessionId, 'company', companies);
      emitProgress(sessionId, { type: 'step', step: 'companies', message: `Выгружено ${companies.length} компаний`, count: companies.length });
    }

    // Update session stats
    db.updateSession({
      id: sessionId,
      status: 'fetched',
      total_deals: leads.length,
      copied_deals: 0,
      rolled_back: 0,
      error_count: 0,
      started_at: null,
      completed_at: null,
    });

    db.log(sessionId, 'info', `Fetch completed: ${leads.length} leads, ${contactIdSet.size} contacts, ${companyIdSet.size} companies`);
    emitProgress(sessionId, {
      type: 'fetched',
      message: 'Данные выгружены из AMO',
      total_deals: leads.length,
      contacts: contactIdSet.size,
      companies: companyIdSet.size,
    });

    return { leads, contacts: contactIdSet.size, companies: companyIdSet.size };
  } catch (err) {
    db.patchSessionStatus(sessionId, 'error');
    db.log(sessionId, 'error', `Fetch failed: ${err.message}`);
    emitProgress(sessionId, { type: 'error', message: err.message });
    throw err;
  }
}

// ─── Main: copy all deals in a session ───────────────────────────────────────
async function copySessionDeals(sessionId, userMapOverride = null) {
  const session = db.getSession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);
  if (session.status !== 'fetched') throw new Error(`Session is not in 'fetched' state (current: ${session.status})`);

  db.patchSessionStatus(sessionId, 'copying');
  db.updateSession({ ...session, status: 'copying', started_at: new Date().toISOString() });

  emitProgress(sessionId, { type: 'status', status: 'copying', message: 'Начинаем копирование...' });

  try {
    // Build stage mapping
    const { mapping: stageMapping } = await buildStageMapping(
      session.amo_pipeline_id,
      session.kommo_pipeline_id
    );
    db.log(sessionId, 'info', `Stage mapping built: ${Object.keys(stageMapping).length} stages`);

    // Get Kommo users for user resolution
    const kommoUsers = await kommo.getUsers ? [] : [];

    // Get all cached leads
    const leads = db.getCached(sessionId, 'lead');
    const total = leads.length;
    let copied = 0, errors = 0, skipped = 0;

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      emitProgress(sessionId, {
        type: 'progress',
        current: i + 1,
        total,
        lead_id: lead.id,
        lead_name: lead.name,
        message: `Копируем сделку ${i + 1}/${total}: ${lead.name || lead.id}`,
      });

      try {
        const result = await copyDeal(lead, session, stageMapping, kommoUsers);
        if (result.skipped) {
          skipped++;
          emitProgress(sessionId, {
            type: 'deal_result',
            amo_id: lead.id,
            kommo_id: result.kommoId,
            status: 'skipped',
            reason: result.reason,
          });
        } else {
          copied++;
          emitProgress(sessionId, {
            type: 'deal_result',
            amo_id: lead.id,
            kommo_id: result.kommoId,
            status: 'ok',
          });
        }
      } catch (err) {
        errors++;
        emitProgress(sessionId, {
          type: 'deal_error',
          amo_id: lead.id,
          lead_name: lead.name,
          error: err.message,
          warning: `Ошибка при копировании сделки "${lead.name}": ${err.message}. Можно пропустить или откатить.`,
        });
        db.log(sessionId, 'error', `Deal ${lead.id} error: ${err.message}`);
        // Continue with next deal
      }
    }

    const status = errors === 0 ? 'completed' : 'completed';
    db.updateSession({
      id: sessionId,
      status,
      total_deals: total,
      copied_deals: copied,
      rolled_back: 0,
      error_count: errors,
      started_at: session.started_at,
      completed_at: new Date().toISOString(),
    });

    db.log(sessionId, 'info', `Copy completed: ${copied} copied, ${skipped} skipped, ${errors} errors`);
    emitProgress(sessionId, {
      type: 'completed',
      status,
      copied,
      skipped,
      errors,
      total,
      message: `Копирование завершено: ${copied} скопировано, ${skipped} пропущено, ${errors} ошибок`,
    });

    return { copied, skipped, errors, total };
  } catch (err) {
    db.patchSessionStatus(sessionId, 'error');
    db.log(sessionId, 'error', `Copy session failed: ${err.message}`);
    emitProgress(sessionId, { type: 'error', message: err.message });
    throw err;
  }
}

// ─── Preview data for session modal ──────────────────────────────────────────
function getSessionPreview(sessionId) {
  const session = db.getSession(sessionId);
  if (!session) return null;

  const leads = db.getCached(sessionId, 'lead');
  const contacts = db.getCached(sessionId, 'contact');
  const companies = db.getCached(sessionId, 'company');
  const mappings = db.getCreatedMappings(sessionId);
  const logs = db.getSessionLog(sessionId, 50);

  // Attach mapping status to each lead
  const leadsWithStatus = leads.map((lead) => {
    const mapping = db.getMapping(sessionId, 'lead', lead.id);
    return {
      id: lead.id,
      name: lead.name,
      price: lead.price,
      status_id: lead.status_id,
      stage_name: lead._embedded?.statuses?.[0]?.name,
      contacts_count: lead._embedded?.contacts?.length || 0,
      created_at: lead.created_at,
      copy_status: mapping?.status || 'pending',
      kommo_id: mapping?.kommo_id || null,
      error: mapping?.error_msg || null,
    };
  });

  return {
    session,
    summary: {
      total_leads: leads.length,
      total_contacts: contacts.length,
      total_companies: companies.length,
      copied: mappings.filter((m) => m.entity_type === 'lead' && m.status === 'created').length,
      skipped: mappings.filter((m) => m.entity_type === 'lead' && m.status === 'skipped').length,
      errors: mappings.filter((m) => m.entity_type === 'lead' && m.status === 'error').length,
    },
    leads: leadsWithStatus,
    logs,
  };
}

module.exports = {
  registerSSE,
  unregisterSSE,
  emitProgress,
  resolveKommoUserId,
  buildStageMapping,
  fetchSessionData,
  copySessionDeals,
  getSessionPreview,
  DEFAULT_USER_MAP,
  FALLBACK_KOMMO_EMAIL,
};
