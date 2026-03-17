const axios = require('axios');
const fs = require('fs');
require('dotenv').config({path:'/var/www/amoschool/backend/.env'});
const amoToken = process.env.AMO_TOKEN;
const kommoToken = process.env.KOMMO_TOKEN;
const SKIP = new Set([10, 11, 'amomail_message', 'extended_service_message', 'lead_auto_created']);

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const idx = JSON.parse(fs.readFileSync('/var/www/amoschool/backend/backups/migration_index.json', 'utf8'));
  const leadsMap = idx.leads || {};
  const amoLeadIds = Object.keys(leadsMap);
  
  console.log(`Total deals in index: ${amoLeadIds.length}`);
  
  const problems = [];
  
  for (const amoId of amoLeadIds) {
    const kommoId = leadsMap[amoId];
    
    // Get AMO notes
    let amoNotes = [];
    try {
      const r = await axios.get(`https://houch.amocrm.ru/api/v4/leads/${amoId}/notes?limit=50`, {
        headers: { 'Authorization': 'Bearer ' + amoToken }
      });
      amoNotes = (r.data._embedded ? r.data._embedded.notes : []).filter(n => !SKIP.has(n.note_type));
    } catch(e) { console.log(`AMO ${amoId} error: ${e.response ? e.response.status : e.message}`); }
    await sleep(150);
    
    // Get Kommo notes
    let kommoNotes = [];
    try {
      const r = await axios.get(`https://helloshkolaonlinecom.kommo.com/api/v4/leads/${kommoId}/notes?limit=50`, {
        headers: { 'Authorization': 'Bearer ' + kommoToken }
      });
      kommoNotes = (r.data._embedded ? r.data._embedded.notes : []).filter(n => n.note_type !== 'service_message');
    } catch(e) { console.log(`Kommo ${kommoId} error: ${e.response ? e.response.status : e.message}`); }
    await sleep(150);
    
    const status = amoNotes.length === kommoNotes.length ? 'OK' : 'MISSING';
    if (status === 'MISSING' || amoNotes.length > 0) {
      console.log(`AMO:${amoId} → Kommo:${kommoId} | AMO notes:${amoNotes.length} | Kommo notes:${kommoNotes.length} | ${status}`);
    }
    if (status === 'MISSING') {
      problems.push({ amoId, kommoId, amoCount: amoNotes.length, kommoCount: kommoNotes.length });
    }
  }
  
  console.log('\n=== SUMMARY ===');
  console.log(`Deals with missing notes: ${problems.length}`);
  problems.forEach(p => {
    console.log(`  AMO:${p.amoId} → Kommo:${p.kommoId} missing ${p.amoCount - p.kommoCount} notes`);
  });
  
  fs.writeFileSync('/tmp/problems.json', JSON.stringify(problems, null, 2));
  console.log('\nSaved to /tmp/problems.json');
}
run().catch(e => console.error(e.response ? JSON.stringify(e.response.data) : e.message));
