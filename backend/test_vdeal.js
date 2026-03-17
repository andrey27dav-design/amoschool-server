/**
 * Find a suitable unmigrated test lead and run single-lead transfer via API.
 * Usage: node /var/www/amoschool/backend/test_vdeal.js
 */
'use strict';
process.chdir('/var/www/amoschool/backend');
require('dotenv').config();

const axios = require('axios');
const fse   = require('fs-extra');
const path  = require('path');

const BACKUP_DIR = '/var/www/amoschool/backend/backups';
const CACHE_FILE = path.join(BACKUP_DIR, 'amo_data_cache.json');
const INDEX_FILE = path.join(BACKUP_DIR, 'migration_index.json');
const STAGE_FILE = path.join(BACKUP_DIR, 'stage_mapping.json');

const KOMMO_TOKEN = process.env.KOMMO_TOKEN;
const KOMMO_HOST  = 'helloshkolaonlinecom.kommo.com';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== Virtual Deal Test ===');

  // 1. Load cache
  if (!fse.existsSync(CACHE_FILE)) {
    console.error('ERROR: Cache file not found:', CACHE_FILE);
    return;
  }
  console.log('Loading cache...');
  const cache = fse.readJsonSync(CACHE_FILE);
  const allLeads    = cache.leads     || [];
  const allContacts = cache.contacts  || [];
  const allTasks = [
    ...(cache.tasks        || []),
    ...(cache.leadTasks    || []),
    ...(cache.contactTasks || []),
    ...(cache.companyTasks || []),
  ];
  console.log('Cache: leads=' + allLeads.length + ', contacts=' + allContacts.length + ', allTasks=' + allTasks.length);

  // 2. Load migration index → which AMO lead IDs already migrated
  const idx = fse.existsSync(INDEX_FILE) ? fse.readJsonSync(INDEX_FILE) : {};
  // Index structure: { leads: { pairs: [{amoId, kommoId},...] }, tasks_leads: {...}, ... }
  const leadsSection      = idx.leads      || {};
  const leadsTasksSection = idx.tasks_leads || {};
  const contactTaskSection = idx.tasks_contacts || {};

  const migratedLeadAmoIds = new Set(
    (leadsSection.pairs || []).map(p => Number(p.amoId))
  );
  console.log('Migrated leads in index:', migratedLeadAmoIds.size);

  // 3. Build contact tasks map
  const contactTasksByContactId = {};
  for (const t of allTasks) {
    if (t.entity_type === 'contacts') {
      const cid = Number(t.entity_id);
      if (!contactTasksByContactId[cid]) contactTasksByContactId[cid] = [];
      contactTasksByContactId[cid].push(t);
    }
  }
  console.log('Contacts with tasks:', Object.keys(contactTasksByContactId).length);

  // 4. Find a suitable unmigrated lead
  let testLead = null;
  let testLeadTasks = [];
  let testContactTasks = [];

  for (const lead of allLeads) {
    if (migratedLeadAmoIds.has(lead.id)) continue;
    const ltasks = allTasks.filter(t => t.entity_type === 'leads' && Number(t.entity_id) === lead.id);
    const contactIds = (lead._embedded && lead._embedded.contacts || []).map(c => Number(c.id));
    const ctasks = contactIds.flatMap(cid => contactTasksByContactId[cid] || []);
    if (ltasks.length > 0 && ctasks.length > 0) {
      testLead = lead;
      testLeadTasks = ltasks;
      testContactTasks = ctasks;
      break;
    }
  }

  // fallback: any unmigrated lead with any tasks
  if (!testLead) {
    for (const lead of allLeads) {
      if (migratedLeadAmoIds.has(lead.id)) continue;
      const ltasks = allTasks.filter(t => t.entity_type === 'leads' && Number(t.entity_id) === lead.id);
      const contactIds = (lead._embedded && lead._embedded.contacts || []).map(c => Number(c.id));
      const ctasks = contactIds.flatMap(cid => contactTasksByContactId[cid] || []);
      if (ltasks.length > 0 || ctasks.length > 0) {
        testLead = lead;
        testLeadTasks = ltasks;
        testContactTasks = ctasks;
        break;
      }
    }
  }

  if (!testLead) {
    const unmigrated = allLeads.filter(l => !migratedLeadAmoIds.has(l.id));
    console.log('No suitable unmigrated test lead found!');
    console.log('Total unmigrated leads:', unmigrated.length);
    if (unmigrated.length > 0) {
      const sample = unmigrated[0];
      console.log('Sample lead:', sample.id, sample.name);
      const sLtasks = allTasks.filter(t => t.entity_type === 'leads' && Number(t.entity_id) === sample.id);
      console.log('Sample lead lead-tasks:', sLtasks.length);
    }
    return;
  }

  const completedLeadTasks = testLeadTasks.filter(t => t.is_completed);
  console.log('\nSelected test lead:');
  console.log('  AMO Lead ID:', testLead.id, '|', testLead.name);
  console.log('  Lead tasks:', testLeadTasks.length, '(completed:', completedLeadTasks.length + ')');
  console.log('  Contact tasks:', testContactTasks.length);

  // 5. Run transfer via backend API
  const stageMapping = fse.existsSync(STAGE_FILE) ? fse.readJsonSync(STAGE_FILE) : {};
  console.log('\nRunning POST /api/migration/transfer-deals with leadId=' + testLead.id + '...');

  let result;
  try {
    const res = await axios.post('http://localhost:3008/api/migration/transfer-deals', {
      leadIds: [testLead.id],
      stageMapping: stageMapping
    }, { timeout: 60000 });
    result = res.data;
  } catch (e) {
    console.error('Transfer API call FAILED:', e.message);
    if (e.response) console.error('Response:', JSON.stringify(e.response.data).slice(0, 500));
    return;
  }

  console.log('\nTransfer result:');
  console.log('  leads created:', result.transferred && result.transferred.leads || 0);
  console.log('  contacts created:', result.transferred && result.transferred.contacts || 0);
  console.log('  tasks created:', result.transferred && result.transferred.tasks || 0);
  console.log('  notes created:', result.transferred && result.transferred.notes || 0);
  console.log('  tasksDetail:', JSON.stringify(result.tasksDetail || {}));
  console.log('  errors:', (result.errors || []).length);
  console.log('  warnings:', (result.warnings || []).slice(0, 3));
  if (result.errors && result.errors.length > 0) console.log('  ERROR list:', result.errors);

  // 6. Verify in Kommo
  const kommoLeadId = (result.createdIds && result.createdIds.leads || [])[0];
  if (!kommoLeadId) {
    console.log('\nWARN: No new Kommo lead ID — lead was likely already migrated (skipped by safety guard)');
    return;
  }

  await sleep(2000);
  const kommoAxios = axios.create({
    baseURL: 'https://' + KOMMO_HOST,
    headers: { Authorization: 'Bearer ' + KOMMO_TOKEN }
  });

  console.log('\n=== Kommo Verification (lead #' + kommoLeadId + ') ===');

  // Lead tasks
  try {
    const kt = await kommoAxios.get('/api/v4/tasks', { params: { 'filter[entity_id]': kommoLeadId, 'filter[entity_type]': 'leads', limit: 50 } });
    const kLeadTasks = (kt.data && kt.data._embedded && kt.data._embedded.tasks) || [];
    console.log('\nKommo LEAD tasks:', kLeadTasks.length, '(expected ~' + testLeadTasks.length + ')');
    kLeadTasks.slice(0, 5).forEach(t => {
      const prefix = (t.text || '').match(/^\[\d\d\.\d\d\.\d{4}\]/) ? 'DATE_PREFIX_OK' : 'NO_DATE_PREFIX';
      console.log('  [' + prefix + '] id=' + t.id + ' completed=' + !!t.is_completed + ' text=' + (t.text || '').slice(0, 70));
    });
    const completedInKommo = kLeadTasks.filter(t => t.is_completed).length;
    console.log('  Completed tasks in Kommo: ' + completedInKommo + ' (expected: ' + completedLeadTasks.length + ')');
    if (completedInKommo >= completedLeadTasks.length) {
      console.log('  PASS: completed tasks marked OK');
    } else {
      console.log('  WARN: fewer completed tasks than expected');
    }
  } catch (e) { console.error('  Could not fetch Kommo lead tasks:', e.message); }

  // Lead notes
  try {
    const kn = await kommoAxios.get('/api/v4/leads/' + kommoLeadId + '/notes', { params: { limit: 50 } });
    const kLeadNotes = (kn.data && kn.data._embedded && kn.data._embedded.notes) || [];
    console.log('\nKommo LEAD notes:', kLeadNotes.length);
    kLeadNotes.slice(0, 3).forEach(n => {
      const txt = (n.params && n.params.text) || JSON.stringify(n.params).slice(0, 40);
      const prefix = txt.match(/^\[\d\d\.\d\d\.\d{4}\]/) ? 'DATE_PREFIX_OK' : 'NO_DATE_PREFIX';
      console.log('  [' + prefix + '] id=' + n.id + ' type=' + n.note_type + ' text=' + txt.slice(0, 60));
    });
  } catch (e) { console.error('  Could not fetch Kommo lead notes:', e.message); }

  // Contact tasks
  const kommoContactId = (result.createdIds && result.createdIds.contacts || [])[0];
  if (kommoContactId && testContactTasks.length > 0) {
    try {
      const kct = await kommoAxios.get('/api/v4/tasks', { params: { 'filter[entity_id]': kommoContactId, 'filter[entity_type]': 'contacts', limit: 50 } });
      const kCtTasks = (kct.data && kct.data._embedded && kct.data._embedded.tasks) || [];
      console.log('\nKommo CONTACT tasks:', kCtTasks.length, '(expected ~' + testContactTasks.length + ')');
      kCtTasks.slice(0, 5).forEach(t => {
        const prefix = (t.text || '').match(/^\[\d\d\.\d\d\.\d{4}\]/) ? 'DATE_PREFIX_OK' : 'NO_DATE_PREFIX';
        console.log('  [' + prefix + '] id=' + t.id + ' completed=' + !!t.is_completed + ' text=' + (t.text || '').slice(0, 70));
      });
      if (kCtTasks.length >= testContactTasks.length) {
        console.log('  PASS: Contact tasks migrated correctly!');
      } else {
        console.log('  PARTIAL: expected ' + testContactTasks.length + ', got ' + kCtTasks.length);
      }
    } catch (e) { console.error('  Could not fetch Kommo contact tasks:', e.message); }
  } else if (testContactTasks.length > 0) {
    console.log('\nContact tasks detail:', JSON.stringify(result.tasksDetail && result.tasksDetail.contacts));
    console.log('(contact may have pre-existed, tasks assigned to existing Kommo contact)');
  }

  console.log('\n=== TEST COMPLETE ===');
  console.log('AMO lead ' + testLead.id + ' → Kommo lead ' + kommoLeadId);
}

main().catch(e => console.error('FATAL:', e.message, e.stack));
