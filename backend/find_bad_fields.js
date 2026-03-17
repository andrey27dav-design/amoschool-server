// Find which custom field causes 400 when PATCHing
const axios = require('axios');
const path = require('path');

const KOMMO_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImFiNmFlNzdiNjI4NWQ1ZmYwNmM0MmY4ZjQ2NjRhYmU0NGNkNDgzMWJlZTRhNDM2MzI0NjEyZGY1N2FjZGNkYzUwNjRlYTFjNDk2ZDQxN2E3In0.eyJhdWQiOiI3MTU3NTZiYS00MTk3LTQ5MWItYTQ2MS0wOTlkMDJkNTdlMTYiLCJqdGkiOiJhYjZhZTc3YjYyODVkNWZmMDZjNDJmOGY0NjY0YWJlNDRjZDQ4MzFiZWU0YTQzNjMyNDYxMmRmNTdhY2RjZGM1MDY0ZWExYzQ5NmQ0MTdhNyIsImlhdCI6MTc3MTQ4NjExNiwibmJmIjoxNzcxNDg2MTE2LCJleHAiOjE4MzAyOTc2MDAsInN1YiI6IjEyNzM5Nzk1IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjM0MTkyNTIzLCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJjcm0iLCJmaWxlcyIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJwdXNoX25vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiM2ZmYzRmYjItOTRiNy00ZWFhLTkzY2QtMmU1YzU4ZWQwMjlmIiwiYXBpX2RvbWFpbiI6ImFwaS1nLmtvbW1vLmNvbSJ9.J-fe71D0ODNz_OvlZIJSP0dZ-DSN9qUUtCjDxmcm76l-X2oiKTrlQht6gPuPygEgbdezr-9DD5mqxdYAnVNi92eahqLTWAiVS9UmieiFc2duGnYwlKO3zJ44zd0hV_D29HTPawhNAjm3bur19FKYSV7teJKUCPdSVOkp_ew7I2TmEszKqvGTisWubplGz9wUROBefUzjCKGgMSXXhqZm27FHKE6RhAUTSagys6o09dxxh2gGktEXJ5BpoQ2Q3GX3y-I8YDPHs-R6bbxLz6SUol3s5fzobM9KNY1NgbNZ1297v43Wp2PUTLfgDY7fDX4d7zFjGFYlYjn-2XOvdFiTQA';

const BASE = 'https://helloshkolaonlinecom.kommo.com';
const headers = { Authorization: `Bearer ${KOMMO_TOKEN}`, 'Content-Type': 'application/json' };

const KOMMO_LEAD_ID = 18219421;
const KOMMO_CONTACT_ID = 21177497;

// Load full transformed data for the test deal
const { transformLead, transformContact, transformCustomFields } = require('./src/utils/dataTransformer');
const { loadFieldMapping } = require('./src/utils/fieldMapping');
const cache = require('./backups/amo_data_cache.json');
const fieldMappings = loadFieldMapping();
const stageMapping = require('./backups/stage_mapping.json');

const lead = cache.leads.find(l => l.id === 31635363);
const contact = cache.contacts.find(c => c.id === 32191201);

const tLead = transformLead(lead, stageMapping, fieldMappings.leads);
const tContact = transformContact(contact, fieldMappings.contacts);

console.log('Lead custom fields count:', tLead.custom_fields_values?.length || 0);
console.log('Contact custom fields count:', tContact.custom_fields_values?.length || 0);

async function patch(url, body) {
  try {
    const r = await axios.patch(url, body, { headers });
    return { ok: true, status: r.status };
  } catch (e) {
    return { ok: false, status: e.response?.status, data: JSON.stringify(e.response?.data) };
  }
}

async function findBadFields(entityType, kommoId, cfv) {
  console.log(`\n---- Testing ${entityType} #${kommoId} with ${cfv.length} custom fields ----`);
  const url = `${BASE}/api/v4/${entityType}`;
  
  // Test all at once
  const allResult = await patch(url, [{ id: kommoId, custom_fields_values: cfv }]);
  if (allResult.ok) {
    console.log('✅ All fields at once: OK');
    return;
  }
  console.log(`❌ All fields: ${allResult.status} — ${allResult.data}`);
  
  // Binary search: test first half, then second half
  // Actually just test each field individually
  const bad = [];
  for (const field of cfv) {
    const r = await patch(url, [{ id: kommoId, custom_fields_values: [field] }]);
    if (!r.ok) {
      console.log(`  ❌ field_id=${field.field_id} values=${JSON.stringify(field.values)} → ${r.status} ${r.data}`);
      bad.push(field);
    }
  }
  if (bad.length === 0) {
    console.log('  ⚠️  No individual field failed — issue is combination/conflict');
  } else {
    console.log(`\nBad fields (${bad.length}):`, JSON.stringify(bad, null, 2));
  }
}

async function main() {
  if (tLead.custom_fields_values?.length) {
    await findBadFields('leads', KOMMO_LEAD_ID, tLead.custom_fields_values);
  }
  if (tContact.custom_fields_values?.length) {
    await findBadFields('contacts', KOMMO_CONTACT_ID, tContact.custom_fields_values);
  }
  
  // Test linking
  console.log('\n---- Testing links ----');
  const r1 = await patch(`${BASE}/api/v4/leads`, [{ id: KOMMO_LEAD_ID, _embedded: { contacts: [{ id: KOMMO_CONTACT_ID }] } }]);
  console.log(`Link contact: ${r1.ok ? '✅' : '❌'} ${r1.status} ${r1.data || ''}`);
}

main().catch(console.error);
