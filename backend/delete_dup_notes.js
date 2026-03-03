const https = require('https');

const KOMMO_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImFiNmFlNzdiNjI4NWQ1ZmYwNmM0MmY4ZjQ2NjRhYmU0NGNkNDgzMWJlZTRhNDM2MzI0NjEyZGY1N2FjZGNkYzUwNjRlYTFjNDk2ZDQxN2E3In0.eyJhdWQiOiI3MTU3NTZiYS00MTk3LTQ5MWItYTQ2MS0wOTlkMDJkNTdlMTYiLCJqdGkiOiJhYjZhZTc3YjYyODVkNWZmMDZjNDJmOGY0NjY0YWJlNDRjZDQ4MzFiZWU0YTQzNjMyNDYxMmRmNTdhY2RjZGM1MDY0ZWExYzQ5NmQ0MTdhNyIsImlhdCI6MTc3MTQ4NjExNiwibmJmIjoxNzcxNDg2MTE2LCJleHAiOjE4MzAyOTc2MDAsInN1YiI6IjEyNzM5Nzk1IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjM0MTkyNTIzLCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJjcm0iLCJmaWxlcyIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJwdXNoX25vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiM2ZmYzRmYjItOTRiNy00ZWFhLTkzY2QtMmU1YzU4ZWQwMjlmIiwiYXBpX2RvbWFpbiI6ImFwaS1nLmtvbW1vLmNvbSJ9.J-fe71D0ODNz_OvlZIJSP0dZ-DSN9qUUtCjDxmcm76l-X2oiKTrlQht6gPuPygEgbdezr-9DD5mqxdYAnVNi92eahqLTWAiVS9UmieiFc2duGnYwlKO3zJ44zd0hV_D29HTPawhNAjm3bur19FKYSV7teJKUCPdSVOkp_ew7I2TmEszKqvGTisWubplGz9wUROBefUzjCKGgMSXXhqZm27FHKE6RhAUTSagys6o09dxxh2gGktEXJ5BpoQ2Q3GX3y-I8YDPHs-R6bbxLz6SUol3s5fzobM9KNY1NgbNZ1297v43Wp2PUTLfgDY7fDX4d7zFjGFYlYjn-2XOvdFiTQA';
const KOMMO_DOMAIN = 'helloshkolaonlinecom.kommo.com';

// Удалить: дубли и невидимая service_message
// Оставить: 7445637, 7445639, 7445641 (последние правильные)
const TO_DELETE = [7443365, 7443367, 7443369, 7444691];

function del(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: KOMMO_DOMAIN,
      path,
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + KOMMO_TOKEN }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    https.get({ hostname: KOMMO_DOMAIN, path, headers: { 'Authorization': 'Bearer ' + KOMMO_TOKEN } }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({}); } });
    }).on('error', reject);
  });
}

async function main() {
  const dealId = 18287787;

  console.log('Удаляю дубли и невидимую service_message...\n');
  for (const noteId of TO_DELETE) {
    const r = await del(`/api/v4/leads/${dealId}/notes/${noteId}`);
    console.log(`DELETE note ${noteId}: HTTP ${r.status}`);
  }

  // Проверяем что осталось
  await new Promise(r => setTimeout(r, 1000));
  const res = await get(`/api/v4/leads/${dealId}/notes?limit=50`);
  const notes = res?._embedded?.notes || [];

  console.log(`\n=== Осталось нот в сделке ${dealId}: ${notes.length} ===`);
  for (const n of notes) {
    const date = new Date(n.created_at * 1000).toISOString().slice(0,19).replace('T',' ');
    const text = (n.params?.text || '').slice(0, 70);
    console.log(`  [${n.id}] type=${n.note_type} date=${date}`);
    console.log(`    ${text}`);
  }
}

main().catch(console.error);
