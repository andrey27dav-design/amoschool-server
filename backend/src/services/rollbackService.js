/**
 * Rollback service.
 * Deletes entities created in Kommo by a session — NEVER touches AMO data.
 */
const kommo = require('./kommoApiV2');
const db    = require('../db');
const logger = require('../utils/logger');

// Delete a single entity from Kommo by type & ID
async function deleteKommoEntity(type, kommoId) {
  switch (type) {
    case 'lead':    return kommo.deleteLead(kommoId);
    case 'contact': return kommo.deleteContact(kommoId);
    case 'company': return kommo.deleteCompany(kommoId);
    case 'task':    return kommo.deleteTask(kommoId);
    case 'note':    // Notes are deleted per-entity; skip here — tied to lead deletion
      break;
    default: break;
  }
}

/**
 * Rollback the last successfully created deal in the session,
 * including its notes, tasks, contacts and companies (only if created in this session).
 */
async function rollbackLastDeal(sessionId) {
  const session = db.getSession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  // Find last created lead mapping
  const lastLead = db.getLastCreatedMapping(sessionId, 'lead');
  if (!lastLead) {
    return { status: 'nothing_to_rollback', message: 'Нет скопированных сделок для отката' };
  }

  const kommoLeadId = lastLead.kommo_id;
  let deleted = 0;
  let errors = [];

  // Rollback notes and tasks created AFTER this lead's mapping entry
  const noteMappings = db.getMappingsCreatedAfter(sessionId, 'note', lastLead.id);
  for (const nm of noteMappings) {
    if (nm.kommo_id) {
      try {
        await kommo.deleteNote('leads', kommoLeadId, nm.kommo_id);
        db.setMapping(sessionId, 'note', nm.amo_id, nm.kommo_id, 'rolled_back');
        deleted++;
      } catch (err) {
        errors.push(`Note ${nm.kommo_id}: ${err.message}`);
      }
    }
  }

  const taskMappings = db.getMappingsCreatedAfter(sessionId, 'task', lastLead.id);
  for (const tm of taskMappings) {
    if (tm.kommo_id) {
      try {
        await kommo.deleteTask(tm.kommo_id);
        db.setMapping(sessionId, 'task', tm.amo_id, tm.kommo_id, 'rolled_back');
        deleted++;
      } catch (err) {
        errors.push(`Task ${tm.kommo_id}: ${err.message}`);
      }
    }
  }

  // Rollback the lead itself
  try {
    await kommo.deleteLead(kommoLeadId);
    db.setMapping(sessionId, 'lead', lastLead.amo_id, kommoLeadId, 'rolled_back');
    deleted++;
    db.log(sessionId, 'info', `Rollback: deleted lead kommo=${kommoLeadId} (amo=${lastLead.amo_id})`);
  } catch (err) {
    errors.push(`Lead ${kommoLeadId}: ${err.message}`);
    db.log(sessionId, 'error', `Rollback lead failed: ${err.message}`);
  }

  if (errors.length > 0) {
    logger.warn(`Rollback last deal had errors: ${errors.join('; ')}`);
  }

  // Update session counters
  const currentSession = db.getSession(sessionId);
  db.updateSession({
    ...currentSession,
    copied_deals: Math.max(0, (currentSession.copied_deals || 1) - 1),
    rolled_back: (currentSession.rolled_back || 0) + 1,
  });

  return {
    status: 'ok',
    deleted,
    errors,
    rolled_back_lead: { amo_id: lastLead.amo_id, kommo_id: kommoLeadId },
  };
}

/**
 * Rollback the entire session: delete all entity types created in Kommo.
 * Order: tasks → notes → leads → contacts → companies
 */
async function rollbackSession(sessionId) {
  const session = db.getSession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  let deleted = 0;
  const errors = [];

  const deleteEntities = async (type, deleteFn) => {
    const mappings = db.getMappingsByStatus(sessionId, type, 'created');
    for (const m of mappings) {
      try {
        await deleteFn(m.kommo_id);
        db.setMapping(sessionId, type, m.amo_id, m.kommo_id, 'rolled_back');
        deleted++;
      } catch (err) {
        if (err.response?.status === 404) {
          // Already gone — mark as rolled back
          db.setMapping(sessionId, type, m.amo_id, m.kommo_id, 'rolled_back');
        } else {
          errors.push(`${type} kommo=${m.kommo_id}: ${err.message}`);
          db.log(sessionId, 'error', `Rollback ${type} ${m.kommo_id} failed: ${err.message}`);
        }
      }
    }
  };

  // Delete in safe order
  await deleteEntities('task', (id) => kommo.deleteTask(id));
  await deleteEntities('lead', (id) => kommo.deleteLead(id));
  await deleteEntities('contact', (id) => kommo.deleteContact(id));
  await deleteEntities('company', (id) => kommo.deleteCompany(id));

  db.log(sessionId, 'info', `Session rollback complete: ${deleted} deleted, ${errors.length} errors`);
  db.updateSession({ ...session, status: 'rolled_back', rolled_back: deleted });

  return { status: 'ok', deleted, errors };
}

module.exports = { rollbackLastDeal, rollbackSession };
