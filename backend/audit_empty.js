const axios = require('axios');
const fs = require('fs');
require('dotenv').config({path:'/var/www/amoschool/backend/.env'});
const amoToken = process.env.AMO_TOKEN;
const kommoToken = process.env.KOMMO_TOKEN;

// 15 deals with 0 notes in Kommo
const emptyDeals = [
  {amoId: '21481577', kommoId: '18287485'},
  {amoId: '21809275', kommoId: '18287789'},
  {amoId: '22595523', kommoId: '18287791'},
  {amoId: '23736885', kommoId: '18287483'},
  {amoId: '24000307', kommoId: '18271901'},
  {amoId: '31635363', kommoId: '18219421'},
  {amoId: '31639355', kommoId: '18222417'},
  {amoId: '31641719', kommoId: '18239367'},
  {amoId: '31644353', kommoId: '18251907'},
  {amoId: '31652221', kommoId: '18283781'},
  {amoId: '31652437', kommoId: '18284311'},
  {amoId: '31652447', kommoId: '18284309'},
  {amoId: '31652515', kommoId: '18284307'},
  {amoId: '31654401', kommoId: '18285131'},
  {amoId: '31654403', kommoId: '18285133'},
];

async function run() {
  const idx = JSON.parse(fs.readFileSync('/var/www/amoschool/backend/backups/migration_index.json', 'utf8'));
  const notesLeads = idx.notes_leads || {};
  
  // For each empty deal, get AMO notes and check what's in index
  for (const d of emptyDeals.slice(0, 5)) { // check first 5
    console.log('\n=== AMO:' + d.amoId + ' → Kommo:' + d.kommoId + ' ===');
    
    // Fetch AMO notes for this deal
    const r = await axios.get(
      'https://houch.amocrm.ru/api/v4/leads/' + d.amoId + '/notes?limit=100',
      { headers: { 'Authorization': 'Bearer ' + amoToken } }
    );
    const amoNotes = r.data._embedded ? r.data._embedded.notes : [];
    console.log('AMO notes count:', amoNotes.length);
    
    for (const n of amoNotes) {
      const kommoNoteId = notesLeads[String(n.id)];
      const inIndex = kommoNoteId ? 'IN_INDEX→' + kommoNoteId : 'NOT_IN_INDEX';
      const text = n.params && n.params.text ? n.params.text.substring(0,50) : '(no text)';
      console.log('  AMO_note:' + n.id + ' type:' + n.note_type + ' | ' + inIndex + ' | ' + text);
      
      // If in index, try to fetch the Kommo note directly
      if (kommoNoteId) {
        try {
          const kr = await axios.get(
            'https://helloshkolaonlinecom.kommo.com/api/v4/leads/notes/' + kommoNoteId,
            { headers: { 'Authorization': 'Bearer ' + kommoToken } }
          );
          const kn = kr.data;
          console.log('    → Kommo note ' + kommoNoteId + ' EXISTS: entity_id=' + kn.entity_id + ' (expected ' + d.kommoId + ') ' + (kn.entity_id == d.kommoId ? '✅' : '❌ WRONG ENTITY!'));
        } catch(e) {
          console.log('    → Kommo note ' + kommoNoteId + ' FETCH ERROR: ' + (e.response ? e.response.status : e.message));
        }
      }
    }
  }
}
run().catch(e => console.error(e.response ? JSON.stringify(e.response.data) : e.message));
