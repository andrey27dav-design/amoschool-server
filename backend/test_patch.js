// Direct test: PATCH lead, contact, link — see exact error from Kommo
const axios = require('axios');

const KOMMO_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImFiNmFlNzdiNjI4NWQ1ZmYwNmM0MmY4ZjQ2NjRhYmU0NGNkNDgzMWJlZTRhNDM2MzI0NjEyZGY1N2FjZGNkYzUwNjRlYTFjNDk2ZDQxN2E3In0.eyJhdWQiOiI3MTU3NTZiYS00MTk3LTQ5MWItYTQ2MS0wOTlkMDJkNTdlMTYiLCJqdGkiOiJhYjZhZTc3YjYyODVkNWZmMDZjNDJmOGY0NjY0YWJlNDRjZDQ4MzFiZWU0YTQzNjMyNDYxMmRmNTdhY2RjZGM1MDY0ZWExYzQ5NmQ0MTdhNyIsImlhdCI6MTc3MTQ4NjExNiwibmJmIjoxNzcxNDg2MTE2LCJleHAiOjE4MzAyOTc2MDAsInN1YiI6IjEyNzM5Nzk1IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjM0MTkyNTIzLCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJjcm0iLCJmaWxlcyIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJwdXNoX25vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiM2ZmYzRmYjItOTRiNy00ZWFhLTkzY2QtMmU1YzU4ZWQwMjlmIiwiYXBpX2RvbWFpbiI6ImFwaS1nLmtvbW1vLmNvbSJ9.J-fe71D0ODNz_OvlZIJSP0dZ-DSN9qUUtCjDxmcm76l-X2oiKTrlQht6gPuPygEgbdezr-9DD5mqxdYAnVNi92eahqLTWAiVS9UmieiFc2duGnYwlKO3zJ44zd0hV_D29HTPawhNAjm3bur19FKYSV7teJKUCPdSVOkp_ew7I2TmEszKqvGTisWubplGz9wUROBefUzjCKGgMSXXhqZm27FHKE6RhAUTSagys6o09dxxh2gGktEXJ5BpoQ2Q3GX3y-I8YDPHs-R6bbxLz6SUol3s5fzobM9KNY1NgbNZ1297v43Wp2PUTLfgDY7fDX4d7zFjGFYlYjn-2XOvdFiTQA';

const BASE = 'https://helloshkolaonlinecom.kommo.com';
const headers = { Authorization: `Bearer ${KOMMO_TOKEN}`, 'Content-Type': 'application/json' };

// IDs from migration_index
const KOMMO_LEAD_ID = 18219421;
const KOMMO_CONTACT_ID = 21177497;
const KOMMO_COMPANY_ID = 21177265;

async function test(name, fn) {
  try {
    const r = await fn();
    console.log(`✅ ${name}: status=${r.status}`);
    console.log('   response:', JSON.stringify(r.data).slice(0, 300));
  } catch (e) {
    console.log(`❌ ${name}: status=${e.response?.status}`);
    console.log('   error:', JSON.stringify(e.response?.data));
  }
}

async function main() {
  // 1. Test PATCH lead with minimal data (just name)
  await test('PATCH lead minimal', () =>
    axios.patch(`${BASE}/api/v4/leads`, [{ id: KOMMO_LEAD_ID, name: 'Тест PATCH' }], { headers })
  );

  // 2. Test PATCH lead with custom field (first mapped field: AMO#64361 → Kommo#708010)
  await test('PATCH lead 1 custom field', () =>
    axios.patch(`${BASE}/api/v4/leads`, [{
      id: KOMMO_LEAD_ID,
      custom_fields_values: [{ field_id: 708010, values: [{ value: 'test' }] }]
    }], { headers })
  );

  // 3. Test PATCH contact minimal
  await test('PATCH contact minimal', () =>
    axios.patch(`${BASE}/api/v4/contacts`, [{ id: KOMMO_CONTACT_ID, name: 'Тест Contact PATCH' }], { headers })
  );

  // 4. Test PATCH contact with custom field (AMO#55561 → Kommo#200296 text)
  await test('PATCH contact 1 custom field', () =>
    axios.patch(`${BASE}/api/v4/contacts`, [{
      id: KOMMO_CONTACT_ID,
      custom_fields_values: [{ field_id: 200296, values: [{ value: 'Manager' }] }]
    }], { headers })
  );

  // 5. Test link contact to lead via _embedded
  await test('PATCH lead link contact via _embedded', () =>
    axios.patch(`${BASE}/api/v4/leads`, [{
      id: KOMMO_LEAD_ID,
      _embedded: { contacts: [{ id: KOMMO_CONTACT_ID }] }
    }], { headers })
  );

  // 6. Test link company to lead via _embedded
  await test('PATCH lead link company via _embedded', () =>
    axios.patch(`${BASE}/api/v4/leads`, [{
      id: KOMMO_LEAD_ID,
      _embedded: { companies: [{ id: KOMMO_COMPANY_ID }] }
    }], { headers })
  );

  // 7. Test POST /api/v4/leads/{id}/contacts (alternative link)
  await test('POST leads links (alt)', () =>
    axios.post(`${BASE}/api/v4/leads/${KOMMO_LEAD_ID}/links`, [
      { to_entity_id: KOMMO_CONTACT_ID, to_entity_type: 'contacts' }
    ], { headers })
  );
}

main();
