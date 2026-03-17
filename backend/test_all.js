// Comprehensive test: contact linking + tasks + notes
const axios = require('axios');
const KOMMO_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImFiNmFlNzdiNjI4NWQ1ZmYwNmM0MmY4ZjQ2NjRhYmU0NGNkNDgzMWJlZTRhNDM2MzI0NjEyZGY1N2FjZGNkYzUwNjRlYTFjNDk2ZDQxN2E3In0.eyJhdWQiOiI3MTU3NTZiYS00MTk3LTQ5MWItYTQ2MS0wOTlkMDJkNTdlMTYiLCJqdGkiOiJhYjZhZTc3YjYyODVkNWZmMDZjNDJmOGY0NjY0YWJlNDRjZDQ4MzFiZWU0YTQzNjMyNDYxMmRmNTdhY2RjZGM1MDY0ZWExYzQ5NmQ0MTdhNyIsImlhdCI6MTc3MTQ4NjExNiwibmJmIjoxNzcxNDg2MTE2LCJleHAiOjE4MzAyOTc2MDAsInN1YiI6IjEyNzM5Nzk1IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjM0MTkyNTIzLCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJjcm0iLCJmaWxlcyIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJwdXNoX25vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiM2ZmYzRmYjItOTRiNy00ZWFhLTkzY2QtMmU1YzU4ZWQwMjlmIiwiYXBpX2RvbWFpbiI6ImFwaS1nLmtvbW1vLmNvbSJ9.J-fe71D0ODNz_OvlZIJSP0dZ-DSN9qUUtCjDxmcm76l-X2oiKTrlQht6gPuPygEgbdezr-9DD5mqxdYAnVNi92eahqLTWAiVS9UmieiFc2duGnYwlKO3zJ44zd0hV_D29HTPawhNAjm3bur19FKYSV7teJKUCPdSVOkp_ew7I2TmEszKqvGTisWubplGz9wUROBefUzjCKGgMSXXhqZm27FHKE6RhAUTSagys6o09dxxh2gGktEXJ5BpoQ2Q3GX3y-I8YDPHs-R6bbxLz6SUol3s5fzobM9KNY1NgbNZ1297v43Wp2PUTLfgDY7fDX4d7zFjGFYlYjn-2XOvdFiTQA';
const AMO_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImI5MGYyZjIxNTIxMGQxNGQ0MTg0NDRhODBkMzBjODlkOTcwMmU4NTBmNjk5YTg3ODk4ODQ5ZmNiMWM1ZWJlZmRjZjAwNGY5ZmQzNzA4Zjg1In0.eyJhdWQiOiJmYzNmMTU4NS0zM2E0LTQwOTMtOTE1Zi0xMWE0OGE1OWUwY2MiLCJqdGkiOiJiOTBmMmYyMTUyMTBkMTRkNDE4NDQ0YTgwZDMwYzg5ZDk3MDJlODUwZjY5OWE4Nzg5ODg0OWZjYjFjNWViZWZkY2YwMDRmOWZkMzcwOGY4NSIsImlhdCI6MTc3MTQ4NjU4MiwibmJmIjoxNzcxNDg2NTgyLCJleHAiOjE4MzAyOTc2MDAsInN1YiI6IjYyMTc3NjgiLCJncmFudF90eXBlIjoiIiwiYWNjb3VudF9pZCI6Mjg5ODcyNTIsImJhc2VfZG9tYWluIjoiYW1vY3JtLnJ1IiwidmVyc2lvbiI6Miwic2NvcGVzIjpbImNybSIsImZpbGVzIiwiZmlsZXNfZGVsZXRlIiwibm90aWZpY2F0aW9ucyIsInB1c2hfbm90aWZpY2F0aW9ucyJdLCJoYXNoX3V1aWQiOiI5ZDFmYzQ2Zi02ZGRhLTRiMjItYTZkYy0zNzJiYTI5YTU1YjEiLCJhcGlfZG9tYWluIjoiYXBpLWIuYW1vY3JtLnJ1In0.HiQPlgnA5h_YEplP4MawVuktKA0wgKWT4Gag-JHIn3yt-0E-q7GO_At0L4ZSV044-R8r9qRFfl5IFUIzx1sB_xXGVdckukIYbjUpfUAy1iRChC2fGWJ7ATjZaR8sQT6tcBXB6wnDJCOoWZgEtJaOyUASvDm_TTltATuieUkSOJ5FQvc2ggfRZ4x_KjFCvAlmwoMeRJv0t3YUXv7PZ4DRJxR7CdW0SQge3hWFmDXi_HBW8e-eP2cLNp3hw_iA7r_xb1LGGYba3fS8_HzBJEnxxnoPiYnxywqK6Ug3ZxpO-SfXyI5IwrwM62q9W6ElZ5ZVPBjkpaKAOclnrO_SUfRlNA';
const KOMMO_DOMAIN = 'helloshkolaonlinecom.kommo.com';
const AMO_DOMAIN = 'houch.amocrm.ru';
const leadId = 18219421;      // Kommo lead
const contactId = 21177497;   // Kommo contact
const amoLeadId = 31635363;   // AMO lead for notes

const kommo = axios.create({ baseURL: 'https://' + KOMMO_DOMAIN, headers: { Authorization: 'Bearer ' + KOMMO_TOKEN, 'Content-Type': 'application/json' } });
const amo = axios.create({ baseURL: 'https://' + AMO_DOMAIN, headers: { Authorization: 'Bearer ' + AMO_TOKEN, 'Content-Type': 'application/json' } });

async function run() {
  // 1. Create fresh contact and lead, try linking at creation time
  console.log('=== CREATE contact + lead with _embedded ===');
  let newContactId, newLeadId;
  try {
    const r = await kommo.post('/api/v4/contacts', [{ name: 'Test Link Contact ' + Date.now() }]);
    newContactId = r.data._embedded.contacts[0].id;
    console.log('New contact id:', newContactId);
  } catch(e) { console.log('Contact create err:', e.response && e.response.status, JSON.stringify(e.response && e.response.data).slice(0,200)); }

  if (newContactId) {
    try {
      const r = await kommo.post('/api/v4/leads', [{ name: 'Test Link Lead', pipeline_id: 13165640, _embedded: { contacts: [{ id: newContactId, is_main: true }] } }]);
      newLeadId = r.data._embedded.leads[0].id;
      console.log('New lead id:', newLeadId);
    } catch(e) { console.log('Lead create err:', e.response && e.response.status, JSON.stringify(e.response && e.response.data).slice(0,200)); }
  }

  if (newLeadId) {
    const r = await kommo.get('/api/v4/leads/' + newLeadId + '?with=contacts');
    const contacts = r.data._embedded && r.data._embedded.contacts;
    console.log('Lead contacts after create-with-embedded:', JSON.stringify(contacts));
  }

  // 2. Test creating a task on the Kommo lead
  console.log('\n=== CREATE TASK on lead ' + leadId + ' ===');
  try {
    const r = await kommo.post('/api/v4/tasks', [{ task_type_id: 1, text: 'Test task ' + Date.now(), complete_till: Math.floor(Date.now()/1000) + 86400, entity_id: leadId, entity_type: 'leads' }]);
    console.log('Task create STATUS:', r.status);
    console.log('Task created:', JSON.stringify(r.data._embedded && r.data._embedded.tasks && r.data._embedded.tasks[0]));
  } catch(e) { console.log('Task ERROR:', e.response && e.response.status, JSON.stringify(e.response && e.response.data)); }

  // 3. Test creating a note on the Kommo lead
  console.log('\n=== CREATE NOTE on lead ' + leadId + ' ===');
  try {
    const r = await kommo.post('/api/v4/leads/notes', [{ entity_id: leadId, note_type: 'common', params: { text: 'Test note ' + Date.now() } }]);
    console.log('Note create STATUS:', r.status);
    const note = r.data._embedded && r.data._embedded.notes && r.data._embedded.notes[0];
    console.log('Note created:', JSON.stringify(note));
  } catch(e) { console.log('Note ERROR:', e.response && e.response.status, JSON.stringify(e.response && e.response.data)); }

  // 4. Fetch AMO lead notes live
  console.log('\n=== GET AMO notes for lead ' + amoLeadId + ' ===');
  try {
    const r = await amo.get('/api/v4/leads/' + amoLeadId + '/notes');
    const notes = r.data._embedded && r.data._embedded.notes;
    console.log('AMO notes count:', notes && notes.length);
    if (notes && notes[0]) console.log('Sample:', JSON.stringify(notes[0]).slice(0, 200));
  } catch(e) { console.log('AMO notes ERROR:', e.response && e.response.status, JSON.stringify(e.response && e.response.data).slice(0,200)); }

  // 5. Cleanup
  if (newLeadId) {
    try { await kommo.delete('/api/v4/leads/' + newLeadId); console.log('\nCleaned up lead', newLeadId); } catch(e) {}
  }
  if (newContactId) {
    try { await kommo.delete('/api/v4/contacts/' + newContactId); console.log('Cleaned up contact', newContactId); } catch(e) {}
  }
}

run().catch(console.error);
