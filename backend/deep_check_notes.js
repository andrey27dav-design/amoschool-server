const axios = require('axios');
require('dotenv').config({path:'/var/www/amoschool/backend/.env'});
const kommoToken = process.env.KOMMO_TOKEN;

async function checkDeal(dealId) {
  console.log(`\n=== Kommo deal ${dealId} ===`);
  
  // Get deal info
  const dR = await axios.get(`https://helloshkolaonlinecom.kommo.com/api/v4/leads/${dealId}?with=contacts`, {
    headers: { 'Authorization': 'Bearer ' + kommoToken }
  });
  console.log('Deal name:', dR.data.name);
  
  // Get notes via deal endpoint
  const nR = await axios.get(`https://helloshkolaonlinecom.kommo.com/api/v4/leads/${dealId}/notes?limit=50`, {
    headers: { 'Authorization': 'Bearer ' + kommoToken }
  });
  const notes = nR.data._embedded ? nR.data._embedded.notes : [];
  console.log('Notes via /leads/:id/notes endpoint:', notes.length);
  notes.forEach(n => {
    const d = new Date(n.created_at * 1000).toISOString().replace('T',' ').substring(0,16);
    const text = n.params && n.params.text ? n.params.text.substring(0,100) : '(no text)';
    console.log(`  ID:${n.id} type:${n.note_type} entity_id:${n.entity_id} date:${d}`);
    console.log(`  text: ${text}`);
  });
  
  // Get notes via generic notes endpoint with filter
  const nR2 = await axios.get(`https://helloshkolaonlinecom.kommo.com/api/v4/leads/notes?filter[entity_id][]=${dealId}&limit=50`, {
    headers: { 'Authorization': 'Bearer ' + kommoToken }
  });
  const notes2 = nR2.data._embedded ? nR2.data._embedded.notes : [];
  console.log('Notes via /leads/notes?filter[entity_id] endpoint:', notes2.length);
}

async function run() {
  await checkDeal(18287785); // AMO 25325811 - Дарья
  await checkDeal(18287787); // AMO 31123875 - Karina
  
  // Also check specific note IDs directly
  console.log('\n=== Direct note lookups ===');
  const noteIds = [7443357, 7443359, 7443361, 7443363, 7443365, 7443369, 7444691];
  for (const id of noteIds) {
    try {
      const r = await axios.get(`https://helloshkolaonlinecom.kommo.com/api/v4/leads/notes/${id}`, {
        headers: { 'Authorization': 'Bearer ' + kommoToken }
      });
      const n = r.data;
      const text = n.params && n.params.text ? n.params.text.substring(0,80) : '(no text)';
      console.log(`Note ${id}: entity_id=${n.entity_id} type=${n.note_type} text=${text}`);
    } catch(e) {
      console.log(`Note ${id}: ERROR ${e.response ? e.response.status : e.message}`);
    }
  }
}
run().catch(e => console.error(e.response ? JSON.stringify(e.response.data) : e.message));
