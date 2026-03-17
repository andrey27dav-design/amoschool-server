const axios = require('axios');
const fs = require('fs');
require('dotenv').config({path:'/var/www/amoschool/backend/.env'});
const amoToken = process.env.AMO_TOKEN;
const kommoToken = process.env.KOMMO_TOKEN;

async function run() {
  const idx = JSON.parse(fs.readFileSync('/var/www/amoschool/backend/backups/migration_index.json', 'utf8'));

  // === AMO deal 25325811 ===
  console.log('=== AMO deal 25325811 ===');
  console.log('In leads index:', idx.leads['25325811'] || 'NOT MIGRATED');

  const amoR = await axios.get('https://houch.amocrm.ru/api/v4/leads/25325811/notes?limit=50', {
    headers: { 'Authorization': 'Bearer ' + amoToken }
  });
  const notes = amoR.data._embedded ? amoR.data._embedded.notes : [];
  console.log('AMO notes count:', notes.length);
  notes.forEach(n => {
    const inIdx = idx.notes_leads[String(n.id)] ? 'IN_INDEX→'+idx.notes_leads[String(n.id)] : 'NOT_MIGRATED';
    const d = new Date(n.created_at * 1000).toISOString().replace('T',' ').substring(0,16);
    const text = n.params && n.params.text ? n.params.text.substring(0, 80) : '(no text)';
    console.log(' ID:', n.id, '| type:', n.note_type, '| date:', d, '|', inIdx, '| text:', text);
  });

  // === AMO deal 31123875 — check Kommo notes ===
  console.log('\n=== Kommo notes for deal 18287787 (AMO 31123875) ===');
  const kR = await axios.get('https://helloshkolaonlinecom.kommo.com/api/v4/leads/18287787/notes?limit=50', {
    headers: { 'Authorization': 'Bearer ' + kommoToken }
  });
  const kNotes = kR.data._embedded ? kR.data._embedded.notes : [];
  console.log('Kommo notes count:', kNotes.length);
  kNotes.forEach(n => {
    const d = new Date(n.created_at * 1000).toISOString().replace('T',' ').substring(0,16);
    const text = n.params && n.params.text ? n.params.text.substring(0, 100) : '(no text)';
    console.log(' Kommo ID:', n.id, '| type:', n.note_type, '| date:', d, '| text:', text);
  });
}
run().catch(e => console.error(e.response ? JSON.stringify(e.response.data) : e.message));
