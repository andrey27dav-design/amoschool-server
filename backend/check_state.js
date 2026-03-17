const axios = require('axios');
const fs = require('fs');
require('dotenv').config({path:'/var/www/amoschool/backend/.env'});
const kommoToken = process.env.KOMMO_TOKEN;

async function run() {
  const idx = JSON.parse(fs.readFileSync('/var/www/amoschool/backend/backups/migration_index.json', 'utf8'));
  
  // Check if AMO note 214220983 is in index
  console.log('214220983 in notes_leads index:', idx.notes_leads['214220983'] || 'NOT IN INDEX');
  console.log('214220981 in notes_leads index:', idx.notes_leads['214220981'] || 'NOT IN INDEX');
  console.log('214220985 in notes_leads index:', idx.notes_leads['214220985'] || 'NOT IN INDEX');
  
  // Fetch ALL notes for Kommo deal 18287787
  const r = await axios.get('https://helloshkolaonlinecom.kommo.com/api/v4/leads/18287787/notes?limit=50', {
    headers: { 'Authorization': 'Bearer ' + kommoToken }
  });
  const notes = r.data._embedded ? r.data._embedded.notes : [];
  console.log('\n=== All Kommo notes for deal 18287787 ===');
  console.log('Total:', notes.length);
  notes.forEach(n => {
    const d = new Date(n.created_at * 1000).toISOString().replace('T', ' ').substring(0, 16);
    const text = n.params && n.params.text ? n.params.text.substring(0, 80) : '(no text)';
    console.log('ID:', n.id, '| type:', n.note_type, '| date:', d, '| text:', text);
  });
}
run().catch(e => console.error(e.response ? JSON.stringify(e.response.data) : e.message));
