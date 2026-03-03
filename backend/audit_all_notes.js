const axios = require('axios');
const fs = require('fs');
require('dotenv').config({path:'/var/www/amoschool/backend/.env'});
const kommoToken = process.env.KOMMO_TOKEN;

async function run() {
  const idx = JSON.parse(fs.readFileSync('/var/www/amoschool/backend/backups/migration_index.json', 'utf8'));
  
  // Get all AMO→Kommo lead mappings
  const leadMap = idx.leads || {};
  const amoIds = Object.keys(leadMap);
  console.log('Total migrated deals in index:', amoIds.length);
  
  // For each deal: check how many Kommo notes exist vs how many are in index
  let totalInIndex = 0;
  let totalInKommo = 0;
  let missing = [];
  
  console.log('\nAMO_ID → KOMMO_ID | In index | In Kommo | Status');
  console.log('─'.repeat(70));
  
  for (const amoId of amoIds) {
    const kommoId = leadMap[amoId];
    
    // Count notes in index for this deal
    const notesInIndex = Object.entries(idx.notes_leads || {})
      .filter(([amoNoteId, kommoNoteId]) => {
        // We need to check which deal each note belongs to
        // notes_leads maps AMO note ID → Kommo note ID
        // We can't directly tell which deal without fetching
        return true; // will count differently
      });
    
    // Count Kommo notes for this deal
    try {
      const r = await axios.get(
        `https://helloshkolaonlinecom.kommo.com/api/v4/leads/${kommoId}/notes?limit=100`,
        { headers: { 'Authorization': 'Bearer ' + kommoToken } }
      );
      const kommoNotes = r.data._embedded ? r.data._embedded.notes : [];
      const visibleNotes = kommoNotes.filter(n => n.note_type !== 'service_message');
      totalInKommo += visibleNotes.length;
      
      if (visibleNotes.length === 0) {
        missing.push({ amoId, kommoId, kommoNotes: kommoNotes.length, visible: visibleNotes.length });
        console.log(`AMO ${amoId} → Kommo ${kommoId} | visible:${visibleNotes.length} total:${kommoNotes.length} | ❌ NO VISIBLE NOTES`);
      } else {
        console.log(`AMO ${amoId} → Kommo ${kommoId} | visible:${visibleNotes.length} total:${kommoNotes.length} | ✅`);
      }
    } catch(e) {
      console.log(`AMO ${amoId} → Kommo ${kommoId} | ERROR: ${e.response ? e.response.status : e.message}`);
    }
  }
  
  console.log('\n─'.repeat(70));
  console.log('Total notes in Kommo (visible):', totalInKommo);
  console.log('Notes in index (notes_leads):', Object.keys(idx.notes_leads || {}).length);
  console.log('\nDeals with NO visible notes in Kommo:', missing.length);
  missing.forEach(m => console.log(` AMO ${m.amoId} → Kommo ${m.kommoId}`));
}
run().catch(e => console.error(e.response ? JSON.stringify(e.response.data) : e.message));
