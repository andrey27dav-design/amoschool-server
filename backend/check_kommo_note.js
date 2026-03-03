const axios = require('axios');
const fs = require('fs');
require('dotenv').config({path:'/var/www/amoschool/backend/.env'});
const kommoToken = process.env.KOMMO_TOKEN;

async function run() {
  const idx = JSON.parse(fs.readFileSync('/var/www/amoschool/backend/backups/migration_index.json', 'utf8'));
  
  // Find Kommo note ID for AMO note 214220981
  const kommoNoteId = idx.notes_leads['214220981'];
  console.log('AMO note 214220981 → Kommo note ID:', kommoNoteId);
  
  if (!kommoNoteId) {
    console.log('Note NOT in index!');
    return;
  }
  
  // Fetch from Kommo
  const r = await axios.get('https://helloshkolaonlinecom.kommo.com/api/v4/leads/notes/' + kommoNoteId, {
    headers: { 'Authorization': 'Bearer ' + kommoToken }
  });
  console.log('\nKommo note full response:');
  console.log(JSON.stringify(r.data, null, 2));
}
run().catch(e => {
  if (e.response) {
    console.error('HTTP', e.response.status, JSON.stringify(e.response.data));
  } else {
    console.error(e.message);
  }
});
