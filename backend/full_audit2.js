const axios = require('axios');
const fs = require('fs');
require('dotenv').config({path:'/var/www/amoschool/backend/.env'});
const kommoToken = process.env.KOMMO_TOKEN;

async function run() {
  const idx = JSON.parse(fs.readFileSync('/var/www/amoschool/backend/backups/migration_index.json', 'utf8'));
  const leadsMap = idx.leads || {};
  const notesLeads = idx.notes_leads || {};
  const amoLeadIds = Object.keys(leadsMap);
  
  console.log('Total migrated leads:', amoLeadIds.length);
  console.log('Total note IDs in index:', Object.keys(notesLeads).length);
  
  let totalFoundInKommo = 0;
  const missingDeals = [];
  
  console.log('\n=== AMO→Kommo notes check per deal ===');
  for (const amoId of amoLeadIds) {
    const kommoId = leadsMap[amoId];
    try {
      const r = await axios.get(
        'https://helloshkolaonlinecom.kommo.com/api/v4/leads/' + kommoId + '/notes?limit=100',
        { headers: { 'Authorization': 'Bearer ' + kommoToken } }
      );
      const notes = r.data._embedded ? r.data._embedded.notes : [];
      const visible = notes.filter(n => n.note_type !== 'service_message');
      totalFoundInKommo += notes.length;
      const status = visible.length > 0 ? '✅' : (notes.length > 0 ? '⚠️ all_hidden' : '❌ EMPTY');
      console.log('AMO:' + amoId + '→Kommo:' + kommoId + ' | api:' + notes.length + ' visible:' + visible.length + ' ' + status);
      if (visible.length === 0) missingDeals.push({amoId, kommoId, apiTotal: notes.length});
    } catch(e) {
      console.log('AMO:' + amoId + '→Kommo:' + kommoId + ' | ERROR:' + (e.response ? e.response.status : e.message));
    }
  }
  
  console.log('\n=== SUMMARY ===');
  console.log('Total notes in Kommo API:', totalFoundInKommo);
  console.log('Deals with no visible notes:', missingDeals.length);
  missingDeals.forEach(d => console.log('  AMO:' + d.amoId + ' → Kommo:' + d.kommoId + ' (api total=' + d.apiTotal + ')'));
  
  // Spot-check 5 note IDs from index — do they exist in Kommo?
  console.log('\n=== Spot-check 5 notes from index ===');
  const sample = Object.entries(notesLeads).slice(0, 5);
  for (const [amoNId, kommoNId] of sample) {
    try {
      const r = await axios.get(
        'https://helloshkolaonlinecom.kommo.com/api/v4/leads/notes/' + kommoNId,
        { headers: { 'Authorization': 'Bearer ' + kommoToken } }
      );
      const n = r.data;
      const text = n.params && n.params.text ? n.params.text.substring(0,60) : '(no text)';
      console.log('AMO_note:' + amoNId + '→Kommo_note:' + kommoNId + ' entity_id='+n.entity_id+' type='+n.note_type+' | '+text);
    } catch(e) {
      console.log('AMO_note:' + amoNId + '→Kommo_note:' + kommoNId + ' ERROR:' + (e.response ? e.response.status : e.message));
    }
  }
}
run().catch(e => console.error(e.response ? JSON.stringify(e.response.data) : e.message));
