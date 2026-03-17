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
  // Test 1: PATCH /api/v4/leads with _embedded.contacts
  console.log('TEST 1: PATCH /api/v4/leads _embedded.contacts');
  try {
    const r = await client.patch('/api/v4/leads', [{ id: leadId, _embedded: { contacts: [{ id: contactId }] } }]);
    console.log('STATUS:', r.status);
    console.log('RESPONSE:', JSON.stringify(r.data).slice(0, 400));
  } catch(e) {
    console.log('ERROR status:', e.response && e.response.status);
    console.log('ERROR data:', JSON.stringify(e.response && e.response.data));
  }

  // Test 2: POST /api/v4/leads/{id}/links
  console.log('\nTEST 2: POST /api/v4/leads/' + leadId + '/links');
  try {
    const r = await client.post('/api/v4/leads/' + leadId + '/links', [{ to_entity_id: contactId, to_entity_type: 'contacts' }]);
    console.log('STATUS:', r.status);
    console.log('RESPONSE:', JSON.stringify(r.data).slice(0, 400));
  } catch(e) {
    console.log('ERROR status:', e.response && e.response.status);
    console.log('ERROR data:', JSON.stringify(e.response && e.response.data));
  }

  // Test 3: Check current lead state
  console.log('\nTEST 3: GET lead contacts');
  try {
    const r = await client.get('/api/v4/leads/' + leadId + '?with=contacts');
    const contacts = r.data._embedded && r.data._embedded.contacts;
    console.log('STATUS:', r.status);
    console.log('Linked contacts:', JSON.stringify(contacts));
  } catch(e) {
    console.log('ERROR:', e.response && e.response.status, JSON.stringify(e.response && e.response.data));
  }
}

run().catch(console.error);
