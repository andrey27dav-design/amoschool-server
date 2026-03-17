const https = require('https');

const KOMMO_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImFiNmFlNzdiNjI4NWQ1ZmYwNmM0MmY4ZjQ2NjRhYmU0NGNkNDgzMWJlZTRhNDM2MzI0NjEyZGY1N2FjZGNkYzUwNjRlYTFjNDk2ZDQxN2E3In0.eyJhdWQiOiI3MTU3NTZiYS00MTk3LTQ5MWItYTQ2MS0wOTlkMDJkNTdlMTYiLCJqdGkiOiJhYjZhZTc3YjYyODVkNWZmMDZjNDJmOGY0NjY0YWJlNDRjZDQ4MzFiZWU0YTQzNjMyNDYxMmRmNTdhY2RjZGM1MDY0ZWExYzQ5NmQ0MTdhNyIsImlhdCI6MTc3MTQ4NjExNiwibmJmIjoxNzcxNDg2MTE2LCJleHAiOjE4MzAyOTc2MDAsInN1YiI6IjEyNzM5Nzk1IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjM0MTkyNTIzLCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJjcm0iLCJmaWxlcyIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJwdXNoX25vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiM2ZmYzRmYjItOTRiNy00ZWFhLTkzY2QtMmU1YzU4ZWQwMjlmIiwiYXBpX2RvbWFpbiI6ImFwaS1nLmtvbW1vLmNvbSJ9.J-fe71D0ODNz_OvlZIJSP0dZ-DSN9qUUtCjDxmcm76l-X2oiKTrlQht6gPuPygEgbdezr-9DD5mqxdYAnVNi92eahqLTWAiVS9UmieiFc2duGnYwlKO3zJ44zd0hV_D29HTPawhNAjm3bur19FKYSV7teJKUCPdSVOkp_ew7I2TmEszKqvGTisWubplGz9wUROBefUzjCKGgMSXXhqZm27FHKE6RhAUTSagys6o09dxxh2gGktEXJ5BpoQ2Q3GX3y-I8YDPHs-R6bbxLz6SUol3s5fzobM9KNY1NgbNZ1297v43Wp2PUTLfgDY7fDX4d7zFjGFYlYjn-2XOvdFiTQA';
const KOMMO_DOMAIN = 'helloshkolaonlinecom.kommo.com';

function get(path) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: KOMMO_DOMAIN, path,
      headers: { 'Authorization': 'Bearer ' + KOMMO_TOKEN }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({}); } });
    }).on('error', reject);
  });
}

async function main() {
  // Получаем ноты с полным набором полей
  const res = await get('/api/v4/leads/18287787/notes?limit=50&with=created_by');
  const notes = res?._embedded?.notes || [];

  console.log('=== Полные данные нот сделки 18287787 ===\n');
  for (const n of notes) {
    const date = new Date(n.created_at * 1000).toISOString().slice(0,19).replace('T',' ');
    console.log(`ID: ${n.id}`);
    console.log(`  note_type:  ${n.note_type}`);
    console.log(`  entity_id:  ${n.entity_id}`);
    console.log(`  created_by: ${n.created_by}`);
    console.log(`  created_at: ${date}`);
    console.log(`  is_editable: ${n.is_editable}`);
    console.log(`  params keys: ${Object.keys(n.params || {}).join(', ')}`);
    console.log(`  text: ${(n.params?.text || '').slice(0,60)}`);
    console.log('');
  }

  // Проверяем созданы ли они от имени реального пользователя или интеграции
  const createdByIds = [...new Set(notes.map(n => n.created_by))];
  console.log('Уникальные created_by:', createdByIds);

  // Проверяем пользователей
  for (const userId of createdByIds) {
    const u = await get(`/api/v4/users/${userId}`);
    console.log(`User ${userId}: ${u.name || u.email || JSON.stringify(u).slice(0,80)}`);
  }
}

main().catch(console.error);
