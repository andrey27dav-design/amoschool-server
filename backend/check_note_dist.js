const axios = require('axios');
const fs = require('fs');
require('dotenv').config({path:'/var/www/amoschool/backend/.env'});
const token = process.env.AMO_TOKEN;
const SKIP_NOTE_TYPES = new Set([10, 11]);

async function run() {
  // Read index to understand structure
  const idx = JSON.parse(fs.readFileSync('/var/www/amoschool/backend/backups/migration_index.json', 'utf8'));
  const topKeys = Object.keys(idx);
  console.log('Index top-level keys:', topKeys);
  
  // Try to extract AMO deal IDs
  let amoLeadIds = [];
  if (idx.leads_map) {
    amoLeadIds = Object.keys(idx.leads_map).map(Number);
    console.log('From leads_map:', amoLeadIds.length, 'deals');
  } else if (idx.notes_leads) {
    amoLeadIds = Object.keys(idx.notes_leads).map(Number);
    console.log('From notes_leads:', amoLeadIds.length, 'deals');
  }
  
  if (!amoLeadIds.length) {
    // Try other keys
    topKeys.forEach(k => {
      const val = idx[k];
      if (typeof val === 'object' && !Array.isArray(val)) {
        console.log(`Key "${k}" has ${Object.keys(val).length} entries, sample:`, Object.keys(val).slice(0,3));
      } else {
        console.log(`Key "${k}":`, JSON.stringify(val).substring(0, 100));
      }
    });
    return;
  }
  
  // Fetch all notes for these leads
  console.log('\nFetching notes for', amoLeadIds.length, 'deals...');
  let allNotes = [];
  const chunks = [];
  for (let i = 0; i < amoLeadIds.length; i += 10) chunks.push(amoLeadIds.slice(i, i+10));
  
  for (const chunk of chunks) {
    const qs = chunk.map(id => `filter[entity_id][]=${id}`).join('&') + '&limit=250';
    const r = await axios.get(`https://houch.amocrm.ru/api/v4/leads/notes?${qs}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const notes = r.data._embedded ? r.data._embedded.notes : [];
    allNotes = allNotes.concat(notes);
  }
  
  console.log('\nTotal lead notes:', allNotes.length);
  const byType = {};
  allNotes.forEach(n => { byType[n.note_type] = (byType[n.note_type] || 0) + 1; });
  console.log('Distribution:', JSON.stringify(byType, null, 2));
  
  const afterFilter = allNotes.filter(n => !SKIP_NOTE_TYPES.has(n.note_type)).length;
  console.log('After SKIP [10,11]:', afterFilter, '(expected ≈54)');
}
run().catch(e => console.error(e.response ? JSON.stringify(e.response.data) : e.message));
