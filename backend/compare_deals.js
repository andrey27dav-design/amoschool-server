const axios = require('axios');
require('dotenv').config({path:'/var/www/amoschool/backend/.env'});
const amoToken = process.env.AMO_TOKEN;
const kommoToken = process.env.KOMMO_TOKEN;

async function run() {
  // AMO deal 31123875
  const amoR = await axios.get('https://houch.amocrm.ru/api/v4/leads/31123875?with=contacts', {
    headers: { 'Authorization': 'Bearer ' + amoToken }
  });
  const amo = amoR.data;
  console.log('=== AMO deal 31123875 ===');
  console.log('Name:', amo.name);
  console.log('Status ID:', amo.status_id);
  console.log('Contacts:', JSON.stringify(amo._embedded && amo._embedded.contacts));

  // Kommo deal 18287787
  const kommoR = await axios.get('https://helloshkolaonlinecom.kommo.com/api/v4/leads/18287787?with=contacts', {
    headers: { 'Authorization': 'Bearer ' + kommoToken }
  });
  const kommo = kommoR.data;
  console.log('\n=== Kommo deal 18287787 ===');
  console.log('Name:', kommo.name);
  console.log('Status ID:', kommo.status_id);
  console.log('Contacts:', JSON.stringify(kommo._embedded && kommo._embedded.contacts));

  // Also get contact names from Kommo
  if (kommo._embedded && kommo._embedded.contacts && kommo._embedded.contacts.length) {
    const cId = kommo._embedded.contacts[0].id;
    const cR = await axios.get('https://helloshkolaonlinecom.kommo.com/api/v4/contacts/' + cId, {
      headers: { 'Authorization': 'Bearer ' + kommoToken }
    });
    console.log('\nKommo contact name:', cR.data.name);
  }
  
  // Get AMO contact names
  if (amo._embedded && amo._embedded.contacts && amo._embedded.contacts.length) {
    const cId = amo._embedded.contacts[0].id;
    const cR = await axios.get('https://houch.amocrm.ru/api/v4/contacts/' + cId, {
      headers: { 'Authorization': 'Bearer ' + amoToken }
    });
    console.log('AMO contact name:', cR.data.name);
  }
}
run().catch(e => console.error(e.response ? JSON.stringify(e.response.data) : e.message));
