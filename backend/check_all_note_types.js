const axios = require('axios');
const fs = require('fs');
require('dotenv').config({path:'/var/www/amoschool/backend/.env'});
const token = process.env.AMO_TOKEN;
const SKIP_NOTE_TYPES = new Set([10, 11]);

async function run() {
  // Read migration index to get migrated lead IDs
  const idx = JSON.parse(fs.readFileSync('/var/www/amoschool/backend/backups/migration_index.json', 'utf8'));
  const leadIds = Object.keys(idx.deals_map || {}).map(Number).filter(Boolean);
  console.log('Migrated deal IDs:', leadIds.length, leadIds);
  
  // Fetch ALL notes for these leads
  const chunks = [];
  for (let i = 0; i < leadIds.length; i += 10) chunks.push(leadIds.slice(i, i+10));
  
  let allNotes = [];
  for (const chunk of chunks) {
    const params = new URLSearchParams();
    chunk.forEach(id => params.append('filter[entity_id][]', id));
    params.append('limit', '250');
    const r = await axios.get('https://houch.amocrm.ru/api/v4/leads/notes?' + params.toString(), {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const notes = r.data._embedded ? r.data._embedded.notes : [];
    allNotes = allNotes.concat(notes);
  }
  
  console.log('\nTotal ALL notes:', allNotes.length);
  
  // By type distribution
  const byType = {};
  allNotes.forEach(n => { byType[n.note_type] = (byType[n.note_type] || 0) + 1; });
  console.log('By note_type:', JSON.stringify(byType, null, 2));
  
  const filtered = allNotes.filter(n => !SKIP_NOTE_TYPES.has(n.note_type));
  console.log('\nAfter filtering types 10,11:', filtered.length);
  console.log('Difference:', allNotes.length - filtered.length, '(these are calls)');
}
run().catch(e => console.error(e.response ? JSON.stringify(e.response.data) : e.message));
