const axios = require('axios');
const KOMMO_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImFiNmFlNzdiNjI4NWQ1ZmYwNmM0MmY4ZjQ2NjRhYmU0NGNkNDgzMWJlZTRhNDM2MzI0NjEyZGY1N2FjZGNkYzUwNjRlYTFjNDk2ZDQxN2E3In0.eyJhdWQiOiI3MTU3NTZiYS00MTk3LTQ5MWItYTQ2MS0wOTlkMDJkNTdlMTYiLCJqdGkiOiJhYjZhZTc3YjYyODVkNWZmMDZjNDJmOGY0NjY0YWJlNDRjZDQ4MzFiZWU0YTQzNjMyNDYxMmRmNTdhY2RjZGM1MDY0ZWExYzQ5NmQ0MTdhNyIsImlhdCI6MTc3MTQ4NjExNiwibmJmIjoxNzcxNDg2MTE2LCJleHAiOjE4MzAyOTc2MDAsInN1YiI6IjEyNzM5Nzk1IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjM0MTkyNTIzLCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJjcm0iLCJmaWxlcyIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJwdXNoX25vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiM2ZmYzRmYjItOTRiNy00ZWFhLTkzY2QtMmU1YzU4ZWQwMjlmIiwiYXBpX2RvbWFpbiI6ImFwaS1nLmtvbW1vLmNvbSJ9.J-fe71D0ODNz_OvlZIJSP0dZ-DSN9qUUtCjDxmcm76l-X2oiKTrlQht6gPuPygEgbdezr-9DD5mqxdYAnVNi92eahqLTWAiVS9UmieiFc2duGnYwlKO3zJ44zd0hV_D29HTPawhNAjm3bur19FKYSV7teJKUCPdSVOkp_ew7I2TmEszKqvGTisWubplGz9wUROBefUzjCKGgMSXXhqZm27FHKE6RhAUTSagys6o09dxxh2gGktEXJ5BpoQ2Q3GX3y-I8YDPHs-R6bbxLz6SUol3s5fzobM9KNY1NgbNZ1297v43Wp2PUTLfgDY7fDX4d7zFjGFYlYjn-2XOvdFiTQA';

const kommo = axios.create({
  baseURL: 'https://helloshkolaonlinecom.kommo.com',
  headers: { Authorization: 'Bearer ' + KOMMO_TOKEN, 'Content-Type': 'application/json' },
  timeout: 10000
});

const leadId = 18219421;
const contactId = 21177497;

async function run() {
  // Test notes with different endpoints
  const notePayload = [{ entity_id: leadId, note_type: 'common', params: { text: 'Test note endpoint check' } }];

  console.log('=== POST /api/v4/leads/notes ===');
  try {
    const r = await kommo.post('/api/v4/leads/notes', notePayload);
    console.log('STATUS:', r.status, 'note id:', r.data._embedded && r.data._embedded.notes && r.data._embedded.notes[0] && r.data._embedded.notes[0].id);
  } catch(e) {
    if (e.code === 'ECONNABORTED') console.log('TIMEOUT (8s exceeded)');
    else console.log('ERR', e.response && e.response.status, JSON.stringify(e.response && e.response.data).slice(0, 300));
  }

  console.log('\n=== POST /api/v4/notes (flat endpoint) ===');
  try {
    const r = await kommo.post('/api/v4/notes', notePayload);
    console.log('STATUS:', r.status, 'note id:', r.data._embedded && r.data._embedded.notes && r.data._embedded.notes[0] && r.data._embedded.notes[0].id);
  } catch(e) {
    if (e.code === 'ECONNABORTED') console.log('TIMEOUT');
    else console.log('ERR', e.response && e.response.status, JSON.stringify(e.response && e.response.data).slice(0, 300));
  }

  // Contact linking - try a DIFFERENT approach: create lead with contact
  console.log('\n=== CREATE lead + contact (embedded in POST) ===');
  let newContactId, newLeadId;
  try {
    const r = await kommo.post('/api/v4/contacts', [{ name: 'LinkTest' + Date.now() }]);
    newContactId = r.data._embedded.contacts[0].id;
    console.log('Contact created:', newContactId);
  } catch(e) {
    if (e.code === 'ECONNABORTED') console.log('TIMEOUT - contact create');
    else console.log('Contact ERR:', e.response && e.response.status);
    return;
  }

  try {
    const r = await kommo.post('/api/v4/leads', [{ name: 'LinkTestLead', pipeline_id: 13165640, _embedded: { contacts: [{ id: newContactId, is_main: true }] } }]);
    newLeadId = r.data._embedded.leads[0].id;
    console.log('Lead created:', newLeadId);
  } catch(e) {
    if (e.code === 'ECONNABORTED') console.log('TIMEOUT - lead create');
    else console.log('Lead ERR:', e.response && e.response.status);
  }

  if (newLeadId) {
    try {
      const r = await kommo.get('/api/v4/leads/' + newLeadId + '?with=contacts');
      console.log('Lead contacts after create-with-embedded:', JSON.stringify(r.data._embedded && r.data._embedded.contacts));
    } catch(e) { console.log('GET ERR:', e.code || e.response && e.response.status); }

    // cleanup
    try { await kommo.delete('/api/v4/leads/' + newLeadId); console.log('Lead deleted'); } catch(e) {}
  }
  if (newContactId) {
    try { await kommo.delete('/api/v4/contacts/' + newContactId); console.log('Contact deleted'); } catch(e) {}
  }
}

run().catch(console.error);
