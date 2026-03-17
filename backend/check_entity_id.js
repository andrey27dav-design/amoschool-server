const https = require('https');

const KOMMO_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImFiNmFlNzdiNjI4NWQ1ZmYwNmM0MmY4ZjQ2NjRhYmU0NGNkNDgzMWJlZTRhNDM2MzI0NjEyZGY1N2FjZGNkYzUwNjRlYTFjNDk2ZDQxN2E3In0.eyJhdWQiOiI3MTU3NTZiYS00MTk3LTQ5MWItYTQ2MS0wOTlkMDJkNTdlMTYiLCJqdGkiOiJhYjZhZTc3YjYyODVkNWZmMDZjNDJmOGY0NjY0YWJlNDRjZDQ4MzFiZWU0YTQzNjMyNDYxMmRmNTdhY2RjZGM1MDY0ZWExYzQ5NmQ0MTdhNyIsImlhdCI6MTc3MTQ4NjExNiwibmJmIjoxNzcxNDg2MTE2LCJleHAiOjE4MzAyOTc2MDAsInN1YiI6IjEyNzM5Nzk1IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjM0MTkyNTIzLCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJjcm0iLCJmaWxlcyIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJwdXNoX25vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiM2ZmYzRmYjItOTRiNy00ZWFhLTkzY2QtMmU1YzU4ZWQwMjlmIiwiYXBpX2RvbWFpbiI6ImFwaS1nLmtvbW1vLmNvbSJ9.J-fe71D0ODNz_OvlZIJSP0dZ-DSN9qUUtCjDxmcm76l-X2oiKTrlQht6gPuPygEgbdezr-9DD5mqxdYAnVNi92eahqLTWAiVS9UmieiFc2duGnYwlKO3zJ44zd0hV_D29HTPawhNAjm3bur19FKYSV7teJKUCPdSVOkp_ew7I2TmEszKqvGTisWubplGz9wUROBefUzjCKGgMSXXhqZm27FHKE6RhAUTSagys6o09dxxh2gGktEXJ5BpoQ2Q3GX3y-I8YDPHs-R6bbxLz6SUol3s5fzobM9KNY1NgbNZ1297v43Wp2PUTLfgDY7fDX4d7zFjGFYlYjn-2XOvdFiTQA';
const KOMMO_DOMAIN = 'helloshkolaonlinecom.kommo.com';

function get(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: KOMMO_DOMAIN,
      path,
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + KOMMO_TOKEN }
    };
    https.get(options, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({}); } });
    }).on('error', reject);
  });
}

async function main() {
  const dealId = 18287787;
  const res = await get(`/api/v4/leads/${dealId}/notes?limit=50`);
  const notes = res?._embedded?.notes || [];

  console.log(`=== Ноты сделки ${dealId} — полная проверка ===`);
  console.log(`Всего нот: ${notes.length}`);
  console.log('');

  for (const n of notes) {
    const date = new Date(n.created_at * 1000).toISOString().slice(0,19).replace('T',' ');
    const text = (n.params?.text || '').slice(0, 60);
    console.log(`ID:${n.id} | entity_id:${n.entity_id} | entity_type:${n.entity_type} | type:${n.note_type}`);
    console.log(`  created_at: ${date} | text: ${text}`);
  }

  // Проверим: есть ли ноты с entity_id != dealId
  const wrongEntity = notes.filter(n => n.entity_id !== dealId && n.entity_id !== String(dealId));
  if (wrongEntity.length > 0) {
    console.log('\n⚠️  НОТЫ С НЕВЕРНЫМ ENTITY_ID:');
    wrongEntity.forEach(n => console.log(`  ID:${n.id} entity_id:${n.entity_id}`));
  } else {
    console.log('\n✅ Все ноты привязаны к сделке', dealId);
  }

  // Проверим entity_type — должен быть 'leads'
  const wrongType = notes.filter(n => n.entity_type !== 'leads');
  if (wrongType.length > 0) {
    console.log('\n⚠️  НОТЫ С НЕВЕРНЫМ ENTITY_TYPE (не leads):');
    wrongType.forEach(n => console.log(`  ID:${n.id} entity_type:${n.entity_type}`));
  }
}

main().catch(console.error);
