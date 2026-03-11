// check-kommo-tasks.js — проверяем task_type_id в Kommo API
const https = require('https');

const KOMMO_TOKEN = process.env.KOMMO_TOKEN || require('./backups/amo_data_cache.json').kommoToken;
const API_DOMAIN = 'api-g.kommo.com';
const ACCOUNT_ID = 34192523;

function request(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_DOMAIN,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImFiNmFlNzdiNjI4NWQ1ZmYwNmM0MmY4ZjQ2NjRhYmU0NGNkNDgzMWJlZTRhNDM2MzI0NjEyZGY1N2FjZGNkYzUwNjRlYTFjNDk2ZDQxN2E3In0.eyJhdWQiOiI3MTU3NTZiYS00MTk3LTQ5MWItYTQ2MS0wOTlkMDJkNTdlMTYiLCJqdGkiOiJhYjZhZTc3YjYyODVkNWZmMDZjNDJmOGY0NjY0YWJlNDRjZDQ4MzFiZWU0YTQzNjMyNDYxMmRmNTdhY2RjZGM1MDY0ZWExYzQ5NmQ0MTdhNyIsImlhdCI6MTc3MTQ4NjExNiwibmJmIjoxNzcxNDg2MTE2LCJleHAiOjE4MzAyOTc2MDAsInN1YiI6IjEyNzM5Nzk1IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjM0MTkyNTIzLCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJjcm0iLCJmaWxlcyIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJwdXNoX25vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiM2ZmYzRmYjItOTRiNy00ZWFhLTkzY2QtMmU1YzU4ZWQwMjlmIiwiYXBpX2RvbWFpbiI6ImFwaS1nLmtvbW1vLmNvbSJ9.J-fe71D0ODNz_OvlZIJSP0dZ-DSN9qUUtCjDxmcm76l-X2oiKTrlQht6gPuPygEgbdezr-9DD5mqxdYAnVNi92eahqLTWAiVS9UmieiFc2duGnYwlKO3zJ44zd0hV_D29HTPawhNAjm3bur19FKYSV7teJKUCPdSVOkp_ew7I2TmEszKqvGTisWubplGz9wUROBefUzjCKGgMSXXhqZm27FHKE6RhAUTSagys6o09dxxh2gGktEXJ5BpoQ2Q3GX3y-I8YDPHs-R6bbxLz6SUol3s5fzobM9KNY1NgbNZ1297v43Wp2PUTLfgDY7fDX4d7zFjGFYlYjn-2XOvdFiTQA',
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  // 1. Get a few tasks from Kommo
  console.log('=== 1. Getting tasks from Kommo ===');
  const tasksRes = await request('/api/v4/tasks?limit=3');
  console.log('Status:', tasksRes.status);
  
  if (tasksRes.body._embedded && tasksRes.body._embedded.tasks) {
    const tasks = tasksRes.body._embedded.tasks;
    console.log('Tasks found:', tasks.length);
    tasks.forEach((t, i) => {
      console.log('\nKommo Task #' + i + ':', JSON.stringify(t, null, 2));
    });
    
    // Check all keys
    const keys = new Set();
    tasks.forEach(t => Object.keys(t).forEach(k => keys.add(k)));
    console.log('\nAll Kommo task keys:', [...keys].sort().join(', '));
    console.log('Has task_type_id:', tasks.some(t => t.task_type_id !== undefined));
  } else {
    console.log('Response:', JSON.stringify(tasksRes.body, null, 2));
  }

  // 2. Check task types endpoint
  console.log('\n\n=== 2. Checking /api/v4/tasks/types (custom task types) ===');
  const typesRes = await request('/api/v4/tasks?filter[task_type]=1&limit=1');
  console.log('Status:', typesRes.status);
  console.log('Body:', JSON.stringify(typesRes.body, null, 2).substring(0, 500));
}

main().catch(e => console.error(e));
