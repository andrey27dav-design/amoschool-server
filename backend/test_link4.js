const axios = require('axios');
const KOMMO_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImFiNmFlNzdiNjI4NWQ1ZmYwNmM0MmY4ZjQ2NjRhYmU0NGNkNDgzMWJlZTRhNDM2MzI0NjEyZGY1N2FjZGNkYzUwNjRlYTFjNDk2ZDQxN2E3In0.eyJhdWQiOiI3MTU3NTZiYS00MTk3LTQ5MWItYTQ2MS0wOTlkMDJkNTdlMTYiLCJqdGkiOiJhYjZhZTc3YjYyODVkNWZmMDZjNDJmOGY0NjY0YWJlNDRjZDQ4MzFiZWU0YTQzNjMyNDYxMmRmNTdhY2RjZGM1MDY0ZWExYzQ5NmQ0MTdhNyIsImlhdCI6MTc3MTQ4NjExNiwibmJmIjoxNzcxNDg2MTE2LCJleHAiOjE4MzAyOTc2MDAsInN1YiI6IjEyNzM5Nzk1IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjM0MTkyNTIzLCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJjcm0iLCJmaWxlcyIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJwdXNoX25vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiM2ZmYzRmYjItOTRiNy00ZWFhLTkzY2QtMmU1YzU4ZWQwMjlmIiwiYXBpX2RvbWFpbiI6ImFwaS1nLmtvbW1vLmNvbSJ9.J-fe71D0ODNz_OvlZIJSP0dZ-DSN9qUUtCjDxmcm76l-X2oiKTrlQht6gPuPygEgbdezr-9DD5mqxdYAnVNi92eahqLTWAiVS9UmieiFc2duGnYwlKO3zJ44zd0hV_D29HTPawhNAjm3bur19FKYSV7teJKUCPdSVOkp_ew7I2TmEszKqvGTisWubplGz9wUROBefUzjCKGgMSXXhqZm27FHKE6RhAUTSagys6o09dxxh2gGktEXJ5BpoQ2Q3GX3y-I8YDPHs-R6bbxLz6SUol3s5fzobM9KNY1NgbNZ1297v43Wp2PUTLfgDY7fDX4d7zFjGFYlYjn-2XOvdFiTQA';
const KOMMO_DOMAIN = 'helloshkolaonlinecom.kommo.com';
// pipeline 12856848 = RUSSIANLANGUADGE DEPARTAMENT
// or use 13165640 which is what the test lead uses
const pipelineId = 13165640;
const contactId = 21177497;
const companyId = 21177265;

const client = axios.create({
  baseURL: 'https://' + KOMMO_DOMAIN,
  headers: { Authorization: 'Bearer ' + KOMMO_TOKEN, 'Content-Type': 'application/json' }
});

async function run() {
  // Create a new lead WITH embedded contact in creation payload
  console.log('=== CREATE new lead WITH contact + company embedded ===');
  let newLeadId;
  try {
    const r = await client.post('/api/v4/leads', [{
      name: 'Test Contact Link ' + Date.now(),
      pipeline_id: pipelineId,
      _embedded: {
        contacts: [{ id: contactId }],
        companies: [{ id: companyId }]
      }
    }]);
    console.log('CREATE STATUS:', r.status);
    const lead = r.data._embedded && r.data._embedded.leads && r.data._embedded.leads[0];
    newLeadId = lead && lead.id;
    console.log('NEW LEAD ID:', newLeadId);
  } catch(e) {
    console.log('CREATE ERROR:', e.response && e.response.status, JSON.stringify(e.response && e.response.data).slice(0,400));
    return;
  }

  // Check contacts on newly created lead
  console.log('\n=== GET newly created lead with=contacts,companies ===');
  try {
    const r = await client.get('/api/v4/leads/' + newLeadId + '?with=contacts,companies');
    const contacts = r.data._embedded && r.data._embedded.contacts;
    const companies = r.data._embedded && r.data._embedded.companies;
    console.log('Contacts:', JSON.stringify(contacts));
    console.log('Companies:', JSON.stringify(companies));
  } catch(e) {
    console.log('GET ERROR:', e.response && e.response.status);
  }

  // Now try PATCH to ADD a contact to the NEW lead (which was just created)
  console.log('\n=== PATCH newly created lead to add contact ===');
  try {
    const r = await client.patch('/api/v4/leads', [{ id: newLeadId, _embedded: { contacts: [{ id: contactId }] } }]);
    console.log('PATCH STATUS:', r.status);
    const updatedLead = r.data._embedded && r.data._embedded.leads && r.data._embedded.leads[0];
    console.log('updated_at changed?', updatedLead && updatedLead.updated_at);
  } catch(e) {
    console.log('PATCH ERROR:', e.response && e.response.status, JSON.stringify(e.response && e.response.data).slice(0,300));
  }

  // Check contacts again
  console.log('\n=== VERIFY after PATCH ===');
  try {
    const r = await client.get('/api/v4/leads/' + newLeadId + '?with=contacts');
    const contacts = r.data._embedded && r.data._embedded.contacts;
    console.log('Contacts after PATCH:', JSON.stringify(contacts));
  } catch(e) {
    console.log('GET ERROR:', e.response && e.response.status);
  }

  // Clean up - delete test lead
  console.log('\n=== CLEANUP: delete test lead ' + newLeadId + ' ===');
  try {
    await client.delete('/api/v4/leads/' + newLeadId);
    console.log('Deleted OK');
  } catch(e) {
    console.log('DELETE error:', e.response && e.response.status);
  }
}

run().catch(console.error);
