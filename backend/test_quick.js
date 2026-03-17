// Quick test with axios timeouts
const axios = require('axios');
const KOMMO_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImFiNmFlNzdiNjI4NWQ1ZmYwNmM0MmY4ZjQ2NjRhYmU0NGNkNDgzMWJlZTRhNDM2MzI0NjEyZGY1N2FjZGNkYzUwNjRlYTFjNDk2ZDQxN2E3In0.eyJhdWQiOiI3MTU3NTZiYS00MTk3LTQ5MWItYTQ2MS0wOTlkMDJkNTdlMTYiLCJqdGkiOiJhYjZhZTc3YjYyODVkNWZmMDZjNDJmOGY0NjY0YWJlNDRjZDQ4MzFiZWU0YTQzNjMyNDYxMmRmNTdhY2RjZGM1MDY0ZWExYzQ5NmQ0MTdhNyIsImlhdCI6MTc3MTQ4NjExNiwibmJmIjoxNzcxNDg2MTE2LCJleHAiOjE4MzAyOTc2MDAsInN1YiI6IjEyNzM5Nzk1IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjM0MTkyNTIzLCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJjcm0iLCJmaWxlcyIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJwdXNoX25vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiM2ZmYzRmYjItOTRiNy00ZWFhLTkzY2QtMmU1YzU4ZWQwMjlmIiwiYXBpX2RvbWFpbiI6ImFwaS1nLmtvbW1vLmNvbSJ9.J-fe71D0ODNz_OvlZIJSP0dZ-DSN9qUUtCjDxmcm76l-X2oiKTrlQht6gPuPygEgbdezr-9DD5mqxdYAnVNi92eahqLTWAiVS9UmieiFc2duGnYwlKO3zJ44zd0hV_D29HTPawhNAjm3bur19FKYSV7teJKUCPdSVOkp_ew7I2TmEszKqvGTisWubplGz9wUROBefUzjCKGgMSXXhqZm27FHKE6RhAUTSagys6o09dxxh2gGktEXJ5BpoQ2Q3GX3y-I8YDPHs-R6bbxLz6SUol3s5fzobM9KNY1NgbNZ1297v43Wp2PUTLfgDY7fDX4d7zFjGFYlYjn-2XOvdFiTQA';
const AMO_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImI5MGYyZjIxNTIxMGQxNGQ0MTg0NDRhODBkMzBjODlkOTcwMmU4NTBmNjk5YTg3ODk4ODQ5ZmNiMWM1ZWJlZmRjZjAwNGY5ZmQzNzA4Zjg1In0.eyJhdWQiOiJmYzNmMTU4NS0zM2E0LTQwOTMtOTE1Zi0xMWE0OGE1OWUwY2MiLCJqdGkiOiJiOTBmMmYyMTUyMTBkMTRkNDE4NDQ0YTgwZDMwYzg5ZDk3MDJlODUwZjY5OWE4Nzg5ODg0OWZjYjFjNWViZWZkY2YwMDRmOWZkMzcwOGY4NSIsImlhdCI6MTc3MTQ4NjU4MiwibmJmIjoxNzcxNDg2NTgyLCJleHAiOjE4MzAyOTc2MDAsInN1YiI6IjYyMTc3NjgiLCJncmFudF90eXBlIjoiIiwiYWNjb3VudF9pZCI6Mjg5ODcyNTIsImJhc2VfZG9tYWluIjoiYW1vY3JtLnJ1IiwidmVyc2lvbiI6Miwic2NvcGVzIjpbImNybSIsImZpbGVzIiwiZmlsZXNfZGVsZXRlIiwibm90aWZpY2F0aW9ucyIsInB1c2hfbm90aWZpY2F0aW9ucyJdLCJoYXNoX3V1aWQiOiI5ZDFmYzQ2Zi02ZGRhLTRiMjItYTZkYy0zNzJiYTI5YTU1YjEiLCJhcGlfZG9tYWluIjoiYXBpLWIuYW1vY3JtLnJ1In0.HiQPlgnA5h_YEplP4MawVuktKA0wgKWT4Gag-JHIn3yt-0E-q7GO_At0L4ZSV044-R8r9qRFfl5IFUIzx1sB_xXGVdckukIYbjUpfUAy1iRChC2fGWJ7ATjZaR8sQT6tcBXB6wnDJCOoWZgEtJaOyUASvDm_TTltATuieUkSOJ5FQvc2ggfRZ4x_KjFCvAlmwoMeRJv0t3YUXv7PZ4DRJxR7CdW0SQge3hWFmDXi_HBW8e-eP2cLNp3hw_iA7r_xb1LGGYba3fS8_HzBJEnxxnoPiYnxywqK6Ug3ZxpO-SfXyI5IwrwM62q9W6ElZ5ZVPBjkpaKAOclnrO_SUfRlNA';

const kommo = axios.create({
  baseURL: 'https://helloshkolaonlinecom.kommo.com',
  headers: { Authorization: 'Bearer ' + KOMMO_TOKEN, 'Content-Type': 'application/json' },
  timeout: 8000
});
const amo = axios.create({
  baseURL: 'https://houch.amocrm.ru',
  headers: { Authorization: 'Bearer ' + AMO_TOKEN, 'Content-Type': 'application/json' },
  timeout: 8000
});

const leadId = 18219421;   // Kommo existing lead
const amoLeadId = 31635363;

async function test(name, fn) {
  console.log('\n=== ' + name + ' ===');
  try { await fn(); }
  catch(e) {
    if (e.code === 'ECONNABORTED') console.log('TIMEOUT');
    else console.log('ERR', e.response && e.response.status, JSON.stringify(e.response && e.response.data).slice(0, 200));
  }
}

async function run() {
  // 1. Create task
  await test('CREATE TASK on kommo lead', async () => {
    const r = await kommo.post('/api/v4/tasks', [{
      task_type_id: 1,
      text: 'Test task',
      complete_till: Math.floor(Date.now()/1000) + 86400,
      entity_id: leadId,
      entity_type: 'leads'
    }]);
    console.log('STATUS:', r.status);
    const t = r.data._embedded && r.data._embedded.tasks && r.data._embedded.tasks[0];
    console.log('Task id:', t && t.id);
    // cleanup
    if (t) { try { await kommo.delete('/api/v4/tasks/' + t.id); } catch(e) {} }
  });

  // 2. Create note  
  await test('CREATE NOTE on kommo lead', async () => {
    const r = await kommo.post('/api/v4/leads/notes', [{
      entity_id: leadId,
      note_type: 'common',
      params: { text: 'Test note ' + Date.now() }
    }]);
    console.log('STATUS:', r.status);
    const n = r.data._embedded && r.data._embedded.notes && r.data._embedded.notes[0];
    console.log('Note id:', n && n.id);
  });

  // 3. Fetch AMO notes
  await test('GET AMO lead notes', async () => {
    const r = await amo.get('/api/v4/leads/' + amoLeadId + '/notes');
    const notes = r.data._embedded && r.data._embedded.notes;
    console.log('AMO notes count:', notes && notes.length);
    if (notes && notes[0]) console.log('First note type:', notes[0].note_type, 'params keys:', Object.keys(notes[0].params || {}));
  });

  // 4. Create a new contact, then create lead WITH that contact to confirm it works
  await test('CREATE contact', async () => {
    const r = await kommo.post('/api/v4/contacts', [{ name: 'TestLink' + Date.now() }]);
    const c = r.data._embedded && r.data._embedded.contacts && r.data._embedded.contacts[0];
    console.log('Contact id:', c && c.id);
    if (!c) return;

    // Create lead with this contact embedded
    const r2 = await kommo.post('/api/v4/leads', [{
      name: 'TestLinkLead',
      pipeline_id: 13165640,
      _embedded: { contacts: [{ id: c.id, is_main: true }] }
    }]);
    const l = r2.data._embedded && r2.data._embedded.leads && r2.data._embedded.leads[0];
    console.log('Lead id:', l && l.id);

    if (l) {
      // check contacts
      const r3 = await kommo.get('/api/v4/leads/' + l.id + '?with=contacts');
      const contacts = r3.data._embedded && r3.data._embedded.contacts;
      console.log('Lead contacts after POST-with-embedded:', JSON.stringify(contacts));

      // cleanup
      try { await kommo.delete('/api/v4/leads/' + l.id); } catch(e) {}
      try { await kommo.delete('/api/v4/contacts/' + c.id); } catch(e) {}
    }
  });
}

run().catch(console.error);
