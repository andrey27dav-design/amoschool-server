const axios = require('axios');
const KOMMO_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImFiNmFlNzdiNjI4NWQ1ZmYwNmM0MmY4ZjQ2NjRhYmU0NGNkNDgzMWJlZTRhNDM2MzI0NjEyZGY1N2FjZGNkYzUwNjRlYTFjNDk2ZDQxN2E3In0.eyJhdWQiOiI3MTU3NTZiYS00MTk3LTQ5MWItYTQ2MS0wOTlkMDJkNTdlMTYiLCJqdGkiOiJhYjZhZTc3YjYyODVkNWZmMDZjNDJmOGY0NjY0YWJlNDRjZDQ4MzFiZWU0YTQzNjMyNDYxMmRmNTdhY2RjZGM1MDY0ZWExYzQ5NmQ0MTdhNyIsImlhdCI6MTc3MTQ4NjExNiwibmJmIjoxNzcxNDg2MTE2LCJleHAiOjE4MzAyOTc2MDAsInN1YiI6IjEyNzM5Nzk1IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjM0MTkyNTIzLCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJjcm0iLCJmaWxlcyIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJwdXNoX25vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiM2ZmYzRmYjItOTRiNy00ZWFhLTkzY2QtMmU1YzU4ZWQwMjlmIiwiYXBpX2RvbWFpbiI6ImFwaS1nLmtvbW1vLmNvbSJ9.J-fe71D0ODNz_OvlZIJSP0dZ-DSN9qUUtCjDxmcm76l-X2oiKTrlQht6gPuPygEgbdezr-9DD5mqxdYAnVNi92eahqLTWAiVS9UmieiFc2duGnYwlKO3zJ44zd0hV_D29HTPawhNAjm3bur19FKYSV7teJKUCPdSVOkp_ew7I2TmEszKqvGTisWubplGz9wUROBefUzjCKGgMSXXhqZm27FHKE6RhAUTSagys6o09dxxh2gGktEXJ5BpoQ2Q3GX3y-I8YDPHs-R6bbxLz6SUol3s5fzobM9KNY1NgbNZ1297v43Wp2PUTLfgDY7fDX4d7zFjGFYlYjn-2XOvdFiTQA';

async function main() {
  const client = axios.create({
    baseURL: 'https://helloshkolaonlinecom.kommo.com',
    headers: { Authorization: 'Bearer ' + KOMMO_TOKEN, 'Content-Type': 'application/json' }
  });

  const cache = require('/var/www/amoschool/backend/backups/amo_data_cache.json');
  const allTasks = [...(cache.leadTasks || cache.tasks || [])];
  const selectedIds = new Set([31635363]);
  const dealTasks = allTasks.filter(t => t.entity_type === 'leads' && selectedIds.has(t.entity_id));
  console.log('dealTasks.length:', dealTasks.length);
  if (dealTasks.length > 0) console.log('sample task entity_type:', dealTasks[0].entity_type, 'entity_id:', dealTasks[0].entity_id);

  // Test createNotesBatch response
  const notePayload = [{ entity_id: 18219421, note_type: 'common', params: { text: 'Test counter check ' + Date.now() } }];
  const noteRes = await client.post('/api/v4/leads/notes', notePayload);
  console.log('Notes POST status:', noteRes.status);
  console.log('Notes response keys:', Object.keys(noteRes.data));
  console.log('Notes _embedded keys:', noteRes.data._embedded ? Object.keys(noteRes.data._embedded) : 'NO _embedded');
  const notes = noteRes.data._embedded?.notes || [];
  console.log('Notes returned:', notes.length, notes.map(n=>n.id));
}
main().catch(e => console.error('ERROR:', e.message, e.response?.data));
