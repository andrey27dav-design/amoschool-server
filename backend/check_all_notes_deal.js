const axios = require('axios');
require('dotenv').config({path:'/var/www/amoschool/backend/.env'});
const token = process.env.AMO_TOKEN;

async function run() {
  // Fetch ALL notes for deal 31123875 with full params
  const r = await axios.get('https://houch.amocrm.ru/api/v4/leads/31123875/notes?limit=50', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const notes = r.data._embedded ? r.data._embedded.notes : [];
  console.log('Total notes:', notes.length);
  
  notes.forEach(n => {
    const d = new Date(n.created_at * 1000).toISOString().replace('T', ' ').substring(0, 16);
    console.log('\n--- ID:', n.id, '| type:', n.note_type, '| date:', d);
    console.log('params:', JSON.stringify(n.params, null, 2));
  });
}
run().catch(e => console.error(e.response ? JSON.stringify(e.response.data) : e.message));
