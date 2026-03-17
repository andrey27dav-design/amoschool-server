const axios = require('axios');
const KOMMO_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImFiNmFlNzdiNjI4NWQ1ZmYwNmM0MmY4ZjQ2NjRhYmU0NGNkNDgzMWJlZTRhNDM2MzI0NjEyZGY1N2FjZGNkYzUwNjRlYTFjNDk2ZDQxN2E3In0.eyJhdWQiOiI3MTU3NTZiYS00MTk3LTQ5MWItYTQ2MS0wOTlkMDJkNTdlMTYiLCJqdGkiOiJhYjZhZTc3YjYyODVkNWZmMDZjNDJmOGY0NjY0YWJlNDRjZDQ4MzFiZWU0YTQzNjMyNDYxMmRmNTdhY2RjZGM1MDY0ZWExYzQ5NmQ0MTdhNyIsImlhdCI6MTc3MTQ4NjExNiwibmJmIjoxNzcxNDg2MTE2LCJleHAiOjE4MzAyOTc2MDAsInN1YiI6IjEyNzM5Nzk1IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjM0MTkyNTIzLCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJjcm0iLCJmaWxlcyIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJwdXNoX25vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiM2ZmYzRmYjItOTRiNy00ZWFhLTkzY2QtMmU1YzU4ZWQwMjlmIiwiYXBpX2RvbWFpbiI6ImFwaS1nLmtvbW1vLmNvbSJ9.J-fe71D0ODNz_OvlZIJSP0dZ-DSN9qUUtCjDxmcm76l-X2oiKTrlQht6gPuPygEgbdezr-9DD5mqxdYAnVNi92eahqLTWAiVS9UmieiFc2duGnYwlKO3zJ44zd0hV_D29HTPawhNAjm3bur19FKYSV7teJKUCPdSVOkp_ew7I2TmEszKqvGTisWubplGz9wUROBefUzjCKGgMSXXhqZm27FHKE6RhAUTSagys6o09dxxh2gGktEXJ5BpoQ2Q3GX3y-I8YDPHs-R6bbxLz6SUol3s5fzobM9KNY1NgbNZ1297v43Wp2PUTLfgDY7fDX4d7zFjGFYlYjn-2XOvdFiTQA';
const KOMMO_DOMAIN = 'helloshkolaonlinecom.kommo.com';
const leadId = 18219421;
const contactId = 21177497;

const client = axios.create({
  baseURL: 'https://' + KOMMO_DOMAIN,
  headers: { Authorization: 'Bearer ' + KOMMO_TOKEN, 'Content-Type': 'application/json' }
});

async function run() {
  // Check contact exists
  console.log('=== CHECK: does contact ' + contactId + ' exist? ===');
  try {
    const r = await client.get('/api/v4/contacts/' + contactId);
    console.log('Contact exists! Name:', r.data.name, 'ID:', r.data.id);
  } catch(e) {
    console.log('Contact GET error:', e.response && e.response.status, JSON.stringify(e.response && e.response.data));
  }

  // Check lead exists and current state
  console.log('\n=== CHECK: lead ' + leadId + ' state ===');
  try {
    const r = await client.get('/api/v4/leads/' + leadId + '?with=contacts,companies');
    console.log('Lead:', r.data.name, 'ID:', r.data.id);
    console.log('Contacts:', JSON.stringify(r.data._embedded && r.data._embedded.contacts));
    console.log('Companies:', JSON.stringify(r.data._embedded && r.data._embedded.companies));
  } catch(e) {
    console.log('Lead GET error:', e.response && e.response.status, JSON.stringify(e.response && e.response.data));
  }

  // Try POST /api/v4/contacts/{id}/links (link contact TO lead)
  console.log('\n=== TEST: POST /api/v4/contacts/' + contactId + '/links ===');
  try {
    const r = await client.post('/api/v4/contacts/' + contactId + '/links', [{ to_entity_id: leadId, to_entity_type: 'leads' }]);
    console.log('STATUS:', r.status, JSON.stringify(r.data).slice(0, 300));
  } catch(e) {
    console.log('ERROR:', e.response && e.response.status, JSON.stringify(e.response && e.response.data));
  }

  // Verify lead contacts after linking
  console.log('\n=== VERIFY: GET lead contacts after linking ===');
  try {
    const r = await client.get('/api/v4/leads/' + leadId + '?with=contacts');
    console.log('Contacts now:', JSON.stringify(r.data._embedded && r.data._embedded.contacts));
  } catch(e) {
    console.log('ERROR:', e.response && e.response.status);
  }
}

run().catch(console.error);
