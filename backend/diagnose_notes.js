const axios = require('axios');
const fs = require('fs');
require('dotenv').config({path:'/var/www/amoschool/backend/.env'});
const token = process.env.AMO_TOKEN;
const SKIP_NOTE_TYPES = new Set([10, 11]);

async function run() {
  const idx = JSON.parse(fs.readFileSync('/var/www/amoschool/backend/backups/migration_index.json', 'utf8'));
  
  // Understand structure
  console.log('=== INDEX STRUCTURE ===');
  const notesLeads = idx.notes_leads || {};
  const notesLeadsKeys = Object.keys(notesLeads);
  console.log('notes_leads keys count:', notesLeadsKeys.length);
  console.log('First 5 keys:', notesLeadsKeys.slice(0, 5));
  console.log('First 5 values:', notesLeadsKeys.slice(0, 5).map(k => notesLeads[k]));
  
  const leadsKeys = Object.keys(idx.leads || {});
  console.log('\nleads keys count:', leadsKeys.length);
  console.log('First 5 leads keys:', leadsKeys.slice(0, 5));
  
  // The notes_leads keys are AMO note IDs → Kommo note IDs
  // The leads keys are AMO lead IDs → Kommo lead IDs
  const amoLeadIds = leadsKeys.map(Number).filter(Boolean);
  console.log('\n=== FETCHING NOTES FOR', amoLeadIds.length, 'LEADS ===');
  
  let allNotes = [];
  const chunks = [];
  for (let i = 0; i < amoLeadIds.length; i += 10) chunks.push(amoLeadIds.slice(i, i+10));
  
  for (const chunk of chunks) {
    const qs = chunk.map(id => 'filter[entity_id][]=' + id).join('&') + '&limit=250';
    try {
      const r = await axios.get('https://houch.amocrm.ru/api/v4/leads/notes?' + qs, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const notes = r.data._embedded ? r.data._embedded.notes : [];
      allNotes = allNotes.concat(notes);
    } catch(e) {
      console.error('chunk error:', e.response ? e.response.status : e.message);
    }
  }
  
  console.log('Total lead notes from AMO:', allNotes.length);
  
  const byType = {};
  allNotes.forEach(n => { byType[n.note_type] = (byType[n.note_type] || 0) + 1; });
  console.log('By note_type:', JSON.stringify(byType, null, 2));
  
  const afterFilter = allNotes.filter(n => !SKIP_NOTE_TYPES.has(n.note_type)).length;
  console.log('\nAfter SKIP [10,11]:', afterFilter, '(expected ≈54 from ПЕРЕНЕСЕНО counter)');
  console.log('Difference remaining:', afterFilter - 54);
  
  // Check how many are in migration index (already migrated)
  const migratedIds = new Set(Object.keys(notesLeads).map(Number));
  const notMigrated = allNotes.filter(n => !SKIP_NOTE_TYPES.has(n.note_type) && !migratedIds.has(n.id));
  console.log('\nNot yet migrated (after filter):', notMigrated.length);
  notMigrated.forEach(n => {
    console.log(' - ID:', n.id, '| type:', n.note_type, '| leadId:', n.entity_id, '| text:', n.params && n.params.text ? n.params.text.substring(0,60) : 'N/A');
  });
  
  // Specifically check deal 31123875
  console.log('\n=== DEAL 31123875 NOTES IN INDEX ===');
  const deal31Notes = allNotes.filter(n => n.entity_id === 31123875);
  deal31Notes.forEach(n => {
    const inIdx = migratedIds.has(n.id);
    console.log(' ID:', n.id, '| type:', n.note_type, '| inIndex:', inIdx, '| text:', n.params && n.params.text ? n.params.text.substring(0,60) : 'N/A');
  });
}
run().catch(e => console.error(e.response ? JSON.stringify(e.response.data) : e.message));
