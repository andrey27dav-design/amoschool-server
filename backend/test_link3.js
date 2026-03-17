const axios = require('axios');
const KOMMO_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImFiNmFlNzdiNjI4NWQ1ZmYwNmM0MmY4ZjQ2NjRhYmU0NGNkNDgzMWJlZTRhNDM2MzI0NjEyZGY1N2FjZGNkYzUwNjRlYTFjNDk2ZDQxN2E3In0.eyJhdWQiOiI3MTU3NTZiYS00MTk3LTQ5MWItYTQ2MS0wOTlkMDJkNTdlMTYiLCJqdGkiOiJhYjZhZTc3YjYyODVkNWZmMDZjNDJmOGY0NjY0YWJlNDRjZDQ4MzFiZWU0YTQzNjMyNDYxMmRmNTdhY2RjZGM1MDY0ZWExYzQ5NmQ0MTdhNyIsImlhdCI6MTc3MTQ4NjExNiwibmJmIjoxNzcxNDg2MTE2LCJleHAiOjE4MzAyOTc2MDAsInN1YiI6IjEyNzM5Nzk1IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjM0MTkyNTIzLCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJjcm0iLCJmaWxlcyIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJwdXNoX25vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiM2ZmYzRmYjItOTRiNy00ZWFhLTkzY2QtMmU1YzU4ZWQwMjlmIiwiYXBpX2RvbWFpbiI6ImFwaS1nLmtvbW1vLmNvbSJ9.J-fe71D0ODNz_OvlZIJSP0dZ-DSN9qUUtCjDxmcm76l-X2oiKTrlQht6gPuPygEgbdezr-9DD5mqxdYAnVNi92eahqLTWAiVS9UmieiFc2duGnYwlKO3zJ44zd0hV_D29HTPawhNAjm3bur19FKYSV7teJKUCPdSVOkp_ew7I2TmEszKqvGTisWubplGz9wUROBefUzjCKGgMSXXhqZm27FHKE6RhAUTSagys6o09dxxh2gGktEXJ5BpoQ2Q3GX3y-I8YDPHs-R6bbxLz6SUol3s5fzobM9KNY1NgbNZ1297v43Wp2PUTLfgDY7fDX4d7zFjGFYlYjn-2XOvdFiTQA';
const KOMMO_DOMAIN = 'helloshkolaonlinecom.kommo.com';
const leadId = 18219421;
const contactId = 21177497;

const client = axios.create({
  baseURL: 'https://' + KOMMO_DOMAIN,
  headers: { Authorization: 'Bearer ' + KOMMO_TOKEN, 'Content-Type': 'application/json' }
});

async function checkContacts() {
  const r = await client.get('/api/v4/leads/' + leadId + '?with=contacts');
  const contacts = r.data._embedded && r.data._embedded.contacts;
  console.log('  Contacts now:', JSON.stringify(contacts));
}

async function run() {
  // TEST A: PATCH /api/v4/leads with is_main:true
  console.log('=== TEST A: PATCH /api/v4/leads _embedded.contacts + is_main:true ===');
  try {
    const r = await client.patch('/api/v4/leads', [{ id: leadId, _embedded: { contacts: [{ id: contactId, is_main: true }] } }]);
    console.log('STATUS:', r.status);
  } catch(e) {
    console.log('ERROR:', e.response && e.response.status, JSON.stringify(e.response && e.response.data).slice(0,200));
  }
  await checkContacts();

  // TEST B: PATCH /api/v4/contacts with _embedded.leads
  console.log('\n=== TEST B: PATCH /api/v4/contacts _embedded.leads ===');
  try {
    const r = await client.patch('/api/v4/contacts', [{ id: contactId, _embedded: { leads: [{ id: leadId, is_main: true }] } }]);
    console.log('STATUS:', r.status, JSON.stringify(r.data).slice(0,300));
  } catch(e) {
    console.log('ERROR:', e.response && e.response.status, JSON.stringify(e.response && e.response.data).slice(0,300));
  }
  await checkContacts();

  // TEST C: Try creating a new deal with contact embedded directly (to see what format works)
  // First list all leads to find a test lead
  console.log('\n=== TEST C: PATCH lead including contact in creation payload ===');
  try {
    // Check what the lead currently looks like
    const r = await client.get('/api/v4/leads/' + leadId);
    console.log('Current lead pipeline_id:', r.data.pipeline_id, 'status_id:', r.data.status_id);
    
    // Try setting the contact via full PATCH
    const r2 = await client.patch('/api/v4/leads', [{
      id: leadId,
      _embedded: {
        contacts: [{ id: contactId }]
      }
    }]);
    console.log('PATCH STATUS:', r2.status);
    console.log('PATCH RESPONSE:', JSON.stringify(r2.data));
  } catch(e) {
    console.log('ERROR:', e.response && e.response.status, JSON.stringify(e.response && e.response.data).slice(0,300));
  }
  
  // Check contacts linked to contact entity itself
  console.log('\n=== CONTACT linked leads check ===');
  try {
    const r = await client.get('/api/v4/contacts/' + contactId + '?with=leads');
    const leads = r.data._embedded && r.data._embedded.leads;
    console.log('Contact linked leads:', JSON.stringify(leads));
  } catch(e) {
    console.log('ERROR:', e.response && e.response.status);
  }
}

run().catch(console.error);
