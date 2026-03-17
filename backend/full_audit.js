const axios = require('axios');
const fs = require('fs');
require('dotenv').config({path:'/var/www/amoschool/backend/.env'});
const kommoToken = process.env.KOMMO_TOKEN;

async function run() {
  const idx = JSON.parse(fs.readFileSync('/var/www/amoschool/backend/backups/migration_index.json', 'utf8'));
  
  // Get all AMO lead IDs → Kommo lead IDs
  const leadsMap = idx.leads || {};
  const amoLeadIds = Object.keys(leadsMap);
  console.log('Total migrated deals in index:', amoLeadIds.length);
  
  // notes_leads: amoNoteId → kommoNoteId
  const notesLeadsMap = idx.notes_leads || {};
  
  // Group: for each AMO deal ID, find which AMO notes belong to it
  // We need to check Kommo side - how many notes are actually in each Kommo deal
  
  let totalExpected = 0;
  let totalFound = 0;
  let totalMissing = 0;
  const missingByDeal = [];
  
  for (const amoId of amoLeadIds) {
    const kommoId = leadsMap[amoId];
    
    // Count expected notes for this deal from index
    // notes_leads maps amoNoteId → kommoNoteId, but doesn't store which AMO deal
    // So we need to fetch from Kommo directly
    
    try {
      const r = await axios.get(`https://helloshkolaonlinecom.kommo.com/api/v4/leads/${kommoId}/notes?limit=50`, {
        headers: { 'Authorization': 'Bearer ' + kommoToken }
      });
      const kommoNotes = r.data._embedded ? r.data._embedded.notes : [];
      const visibleNotes = kommoNotes.filter(n => n.note_type !== 'service_message');
      
      console.log(`AMO ${amoId} → Kommo ${kommoId}: ${visibleNotes.length} visible notes (${kommoNotes.length} total)`);
      if (visibleNotes.length === 0) {
        missingByDeal.push({amoId, kommoId});
      }
      totalFound += visibleNotes.length;
    } catch(e) {
      console.log(`AMO ${amoId} → Kommo ${kommoId}: ERROR ${e.response ? e.response.status : e.message}`);
    }
  }
  
  console.log('\n=== SUMMARY ===');
  console.log('Total notes found in Kommo (visible):', totalFound);
  console.log('Deals with ZERO notes in Kommo:', missingByDeal.length);
  missingByDeal.forEach(d => console.log('  AMO', d.amoId, '→ Kommo', d.kommoId));
  
  // Also check: how many Kommo note IDs from index actually exist
  const kommoNoteIds = Object.values(notesLeadsMap);
  console.log('\nTotal note IDs in index (notes_leads):', kommoNoteIds.length);
  
  // Spot-check 5 random notes from index
  console.log('\nSpot-checking 5 notes from index...');
  const sample = kommoNoteIds.slice(0, 5);
  for (const nId of sample) {
    try {
      const r = await axios.get(`https://helloshkolaonlinecom.kommo.com/api/v4/leads/notes/${nId}`, {
        headers: { 'Authorization': 'Bearer ' + kommoToken }
      });
      const n = r.data;
      const text = n.params && n.params.text ? n.params.text.substring(0,60) : '(no text)';
      console.log(`  Note ${nId}: EXISTS entity_id=${n.entity_id} type=${n.note_type} text=${text}`);
    } catch(e) {
      console.log(`  Note ${nId}: ${e.response ? 'HTTP '+e.response.status+' - DELETED?' : e.message}`);
    }
  }
}
run().catch(e => console.error(e.response ? JSON.stringify(e.response.data) : e.message));
