// Создаём тестовые ноты напрямую через Kommo API для сделки #18287791
const KOMMO_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImFiNmFlNzdiNjI4NWQ1ZmYwNmM0MmY4ZjQ2NjRhYmU0NGNkNDgzMWJlZTRhNDM2MzI0NjEyZGY1N2FjZGNkYzUwNjRlYTFjNDk2ZDQxN2E3In0.eyJhdWQiOiI3MTU3NTZiYS00MTk3LTQ5MWItYTQ2MS0wOTlkMDJkNTdlMTYiLCJqdGkiOiJhYjZhZTc3YjYyODVkNWZmMDZjNDJmOGY0NjY0YWJlNDRjZDQ4MzFiZWU0YTQzNjMyNDYxMmRmNTdhY2RjZGM1MDY0ZWExYzQ5NmQ0MTdhNyIsImlhdCI6MTc3MTQ4NjExNiwibmJmIjoxNzcxNDg2MTE2LCJleHAiOjE4MzAyOTc2MDAsInN1YiI6IjEyNzM5Nzk1IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjM0MTkyNTIzLCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJjcm0iLCJmaWxlcyIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJwdXNoX25vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiM2ZmYzRmYjItOTRiNy00ZWFhLTkzY2QtMmU1YzU4ZWQwMjlmIiwiYXBpX2RvbWFpbiI6ImFwaS1nLmtvbW1vLmNvbSJ9.J-fe71D0ODNz_OvlZIJSP0dZ-DSN9qUUtCjDxmcm76l-X2oiKTrlQht6gPuPygEgbdezr-9DD5mqxdYAnVNi92eahqLTWAiVS9UmieiFc2duGnYwlKO3zJ44zd0hV_D29HTPawhNAjm3bur19FKYSV7teJKUCPdSVOkp_ew7I2TmEszKqvGTisWubplGz9wUROBefUzjCKGgMSXXhqZm27FHKE6RhAUTSagys6o09dxxh2gGktEXJ5BpoQ2Q3GX3y-I8YDPHs-R6bbxLz6SUol3s5fzobM9KNY1NgbNZ1297v43Wp2PUTLfgDY7fDX4d7zFjGFYlYjn-2XOvdFiTQA';
const KOMMO_BASE = 'https://helloshkolaonlinecom.kommo.com';
const DEAL_ID = 18287791;

async function main() {
  const tests = [
    {
      label: 'TEST-A: common БЕЗ created_at, С created_by',
      note: { entity_id: DEAL_ID, note_type: 'common', params: { text: 'TEST-A: без created_at, с created_by' }, created_by: 12739795 }
    },
    {
      label: 'TEST-B: common С датой 2023 И created_by',
      note: { entity_id: DEAL_ID, note_type: 'common', params: { text: 'TEST-B: с датой 2023, с created_by' }, created_at: 1675422000, created_by: 12739795 }
    },
    {
      label: 'TEST-C: common С датой 2023 БЕЗ created_by',
      note: { entity_id: DEAL_ID, note_type: 'common', params: { text: 'TEST-C: с датой 2023, БЕЗ created_by - невидима?' }, created_at: 1675422000 }
    }
  ];

  for (const t of tests) {
    console.log(`\n--- ${t.label} ---`);
    const res = await fetch(`${KOMMO_BASE}/api/v4/leads/notes`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KOMMO_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([t.note])
    });
    const body = await res.json();
    if (res.ok && body._embedded && body._embedded.notes) {
      const n = body._embedded.notes[0];
      console.log(`  ✅ id=${n.id} created_by=${n.created_by} created_at=${new Date(n.created_at*1000).toISOString().substring(0,16)}`);
    } else {
      console.log(`  ❌ HTTP ${res.status}:`, JSON.stringify(body).substring(0, 200));
    }
  }
}

main().catch(console.error);
