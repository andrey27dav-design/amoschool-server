const axios = require('axios');
const fs = require('fs');
require('dotenv').config({path:'/var/www/amoschool/backend/.env'});
const amoToken = process.env.AMO_TOKEN;
const kommoToken = process.env.KOMMO_TOKEN;

const MISSING_DEALS = [
  { amo: '21481577', kommo: '18287485' },
  { amo: '21809275', kommo: '18287789' },
  { amo: '22595523', kommo: '18287791' },
  { amo: '23736885', kommo: '18287483' },
  { amo: '24000307', kommo: '18271901' },
  { amo: '31635363', kommo: '18219421' },
  { amo: '31639355', kommo: '18222417' },
  { amo: '31641719', kommo: '18239367' },
  { amo: '31644353', kommo: '18251907' },
  { amo: '31652221', kommo: '18283781' },
  { amo: '31652437', kommo: '18284311' },
  { amo: '31652447', kommo: '18284309' },
  { amo: '31652515', kommo: '18284307' },
  { amo: '31654401', kommo: '18285131' },
  { amo: '31654403', kommo: '18285133' },
];

async function run() {
  const idx = JSON.parse(fs.readFileSync('/var/www/amoschool/backend/backups/migration_index.json', 'utf8'));
  const notesLeads = idx.notes_leads || {};
  
  // Build reverse map: AMO note → which AMO deal it belongs to
  // We need to fetch AMO notes first to know
  console.log('=== CHECKING INDEX vs REALITY ===\n');
  
  let totalAmoNotes = 0;
  let inIndexCount = 0;
  let kommoNoteExistsCount = 0;
  let kommoNotesMissingCount = 0;
  
  for (const deal of MISSING_DEALS) {
    // Get AMO notes for this deal
    const amoR = await axios.get(
      `https://houch.amocrm.ru/api/v4/leads/${deal.amo}/notes?limit=50`,
      { headers: { 'Authorization': 'Bearer ' + amoToken } }
    );
    const amoNotes = amoR.data._embedded ? amoR.data._embedded.notes : [];
    const SKIP = new Set([10, 11, 'amomail_message', 'extended_service_message', 'lead_auto_created']);
    const migrateable = amoNotes.filter(n => !SKIP.has(n.note_type));
    
    console.log(`AMO ${deal.amo} → Kommo ${deal.kommo} | AMO notes (migrateable): ${migrateable.length}`);
    totalAmoNotes += migrateable.length;
    
    for (const n of migrateable) {
      const kommoNoteId = notesLeads[String(n.id)];
      const inIdx = !!kommoNoteId;
      if (inIdx) inIndexCount++;
      
      // Check if Kommo note actually exists
      let kommoExists = false;
      if (kommoNoteId) {
        try {
          await axios.get(
            `https://helloshkolaonlinecom.kommo.com/api/v4/leads/notes/${kommoNoteId}`,
            { headers: { 'Authorization': 'Bearer ' + kommoToken } }
          );
          kommoExists = true;
          kommoNoteExistsCount++;
        } catch(e) {
          if (e.response && e.response.status === 404) {
            kommoNotesMissingCount++;
          }
        }
      }
      
      const text = n.params && n.params.text ? n.params.text.substring(0,50) : '(no text)';
      const d = new Date(n.created_at * 1000).toISOString().substring(0,10);
      console.log(`  AMO note ${n.id} (${n.note_type}, ${d}) → inIndex:${inIdx ? kommoNoteId : 'NO'} → kommoExists:${kommoExists} | ${text}`);
    }
    console.log('');
  }
  
  console.log('=== SUMMARY ===');
  console.log('AMO migrateable notes in missing deals:', totalAmoNotes);
  console.log('In migration index:', inIndexCount);
  console.log('Kommo note actually exists:', kommoNoteExistsCount);
  console.log('Kommo note 404 (deleted/never created):', kommoNotesMissingCount);
  console.log('Not in index at all:', totalAmoNotes - inIndexCount);
}
run().catch(e => console.error(e.response ? JSON.stringify(e.response.data) : e.message));
