// verify_task.js - check Kommo task response structure
const axios = require('axios');

const KOMMO_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImFiNmFlNzdiNjI4NWQ1ZmYwNmM0MmY4ZjQ2NjRhYmU0NGNkNDgzMWJlZTRhNDM2MzI0NjEyZGY1N2FjZGNkYzUwNjRlYTFjNDk2ZDQxN2E3In0.eyJhdWQiOiI3MTU3NTZiYS00MTk3LTQ5MWItYTQ2MS0wOTlkMDJkNTdlMTYiLCJqdGkiOiJhYjZhZTc3YjYyODVkNWZmMDZjNDJmOGY0NjY0YWJlNDRjZDQ4MzFiZWU0YTQzNjMyNDYxMmRmNTdhY2RjZGM1MDY0ZWExYzQ5NmQ0MTdhNyIsImlhdCI6MTc3MTQ4NjExNiwibmJmIjoxNzcxNDg2MTE2LCJleHAiOjE4MzAyOTc2MDAsInN1YiI6IjEyNzM5Nzk1IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjM0MTkyNTIzLCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJjcm0iLCJmaWxlcyIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJwdXNoX25vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiM2ZmYzRmYjItOTRiNy00ZWFhLTkzY2QtMmU1YzU4ZWQwMjlmIiwiYXBpX2RvbWFpbiI6ImFwaS1nLmtvbW1vLmNvbSJ9.J-fe71D0ODNz_OvlZIJSP0dZ-DSN9qUUtCjDxmcm76l-X2oiKTrlQht6gPuPygEgbdezr-9DD5mqxdYAnVNi92eahqLTWAiVS9UmieiFc2duGnYwlKO3zJ44zd0hV_D29HTPawhNAjm3bur19FKYSV7teJKUCPdSVOkp_ew7I2TmEszKqvGTisWubplGz9wUROBefUzjCKGgMSXXhqZm27FHKE6RhAUTSagys6o09dxxh2gGktEXJ5BpoQ2Q3GX3y-I8YDPHs-R6bbxLz6SUol3s5fzobM9KNY1NgbNZ1297v43Wp2PUTLfgDY7fDX4d7zFjGFYlYjn-2XOvdFiTQA';
const KOMMO_HOST = 'https://helloshkolaonlinecom.kommo.com';

async function checkTask(taskId) {
  const resp = await axios.get(`${KOMMO_HOST}/api/v4/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${KOMMO_TOKEN}` }
  });
  console.log('=== Raw response for task', taskId, '===');
  console.log(JSON.stringify(resp.data, null, 2));
  
  // Try different possible structures
  const data = resp.data;
  const task = data.id ? data : (data._embedded && data._embedded.tasks && data._embedded.tasks[0]);
  
  if (task) {
    console.log('\n=== Parsed task ===');
    console.log('id:', task.id);
    console.log('text:', task.text);
    console.log('is_completed:', task.is_completed);
    console.log('complete_till:', task.complete_till);
    console.log('responsible_user_id:', task.responsible_user_id);
    console.log('entity_id:', task.entity_id);
    console.log('entity_type:', task.entity_type);
    
    const datePrefix = /^\[\d{2}\.\d{2}\.\d{4}\]/.test(task.text || '');
    console.log('\nDate prefix present:', datePrefix);
    console.log('Completed:', !!task.is_completed);
  } else {
    console.log('Could not extract task!');
  }
}

checkTask(2291907).catch(console.error);
