// Quick: show transformed fields and test checkbox specifically
const axios = require('axios');
const { transformLead, transformContact } = require('./src/utils/dataTransformer');
const cache = require('./backups/amo_data_cache.json');
const fieldMappings = require('./backups/field_mapping.json');
const stageMapping = require('./backups/stage_mapping.json');

const KOMMO_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImFiNmFlNzdiNjI4NWQ1ZmYwNmM0MmY4ZjQ2NjRhYmU0NGNkNDgzMWJlZTRhNDM2MzI0NjEyZGY1N2FjZGNkYzUwNjRlYTFjNDk2ZDQxN2E3In0.eyJhdWQiOiI3MTU3NTZiYS00MTk3LTQ5MWItYTQ2MS0wOTlkMDJkNTdlMTYiLCJqdGkiOiJhYjZhZTc3YjYyODVkNWZmMDZjNDJmOGY0NjY0YWJlNDRjZDQ4MzFiZWU0YTQzNjMyNDYxMmRmNTdhY2RjZGM1MDY0ZWExYzQ5NmQ0MTdhNyIsImlhdCI6MTc3MTQ4NjExNiwibmJmIjoxNzcxNDg2MTE2LCJleHAiOjE4MzAyOTc2MDAsInN1YiI6IjEyNzM5Nzk1IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjM0MTkyNTIzLCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJjcm0iLCJmaWxlcyIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJwdXNoX25vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiM2ZmYzRmYjItOTRiNy00ZWFhLTkzY2QtMmU1YzU4ZWQwMjlmIiwiYXBpX2RvbWFpbiI6ImFwaS1nLmtvbW1vLmNvbSJ9.J-fe71D0ODNz_OvlZIJSP0dZ-DSN9qUUtCjDxmcm76l-X2oiKTrlQht6gPuPygEgbdezr-9DD5mqxdYAnVNi92eahqLTWAiVS9UmieiFc2duGnYwlKO3zJ44zd0hV_D29HTPawhNAjm3bur19FKYSV7teJKUCPdSVOkp_ew7I2TmEszKqvGTisWubplGz9wUROBefUzjCKGgMSXXhqZm27FHKE6RhAUTSagys6o09dxxh2gGktEXJ5BpoQ2Q3GX3y-I8YDPHs-R6bbxLz6SUol3s5fzobM9KNY1NgbNZ1297v43Wp2PUTLfgDY7fDX4d7zFjGFYlYjn-2XOvdFiTQA';
const BASE = 'https://helloshkolaonlinecom.kommo.com';
const headers = { Authorization: `Bearer ${KOMMO_TOKEN}`, 'Content-Type': 'application/json' };
const KOMMO_LEAD_ID = 18219421;
const KOMMO_CONTACT_ID = 21177497;

const lead = cache.leads.find(l => l.id === 31635363);
const contact = cache.contacts.find(c => c.id === 32191201);
const tLead = transformLead(lead, stageMapping, fieldMappings.leads);
const tContact = transformContact(contact, fieldMappings.contacts);

// Show field 22 (0-based index)
const cfv = tLead.custom_fields_values || [];
console.log('Field at index 22:', JSON.stringify(cfv[22]));
console.log('Type of value:', typeof cfv[22]?.values?.[0]?.value);

// Show all checkbox fields
const leads_mapping = fieldMappings.leads || {};
console.log('\nAll checkbox fields in lead:');
for (const [amoId, mapped] of Object.entries(leads_mapping)) {
  if ((mapped.kommoFieldType || mapped.amoFieldType) === 'checkbox') {
    const found = (lead.custom_fields_values || []).find(f => f.field_id === Number(amoId));
    const transformed = cfv.find(f => f.field_id === mapped.kommoFieldId);
    console.log(`  AMO#${amoId} → Kommo#${mapped.kommoFieldId}:`);
    console.log(`    AMO raw: ${JSON.stringify(found?.values)}`);
    console.log(`    Transformed: ${JSON.stringify(transformed?.values)}`);
  }
}

// Binary search: split into halves to find bad field quickly
async function patchLead(fields) {
  try {
    const r = await axios.patch(`${BASE}/api/v4/leads`, [{ id: KOMMO_LEAD_ID, custom_fields_values: fields }], { headers });
    return { ok: true };
  } catch (e) {
    return { ok: false, err: JSON.stringify(e.response?.data) };
  }
}

async function findBad(fields, depth = 0) {
  if (fields.length === 0) return [];
  if (fields.length === 1) {
    const r = await patchLead(fields);
    if (!r.ok) return [{ field: fields[0], err: r.err }];
    return [];
  }
  const r = await patchLead(fields);
  if (r.ok) return []; // all good
  const mid = Math.floor(fields.length / 2);
  const left = await findBad(fields.slice(0, mid), depth + 1);
  const right = await findBad(fields.slice(mid), depth + 1);
  return [...left, ...right];
}

async function main() {
  console.log('\n---- Binary search for bad lead fields ----');
  const bad = await findBad(cfv);
  if (bad.length === 0) {
    console.log('✅ All lead fields OK!');
  } else {
    console.log('Bad fields:');
    bad.forEach(b => console.log(`  field_id=${b.field.field_id} values=${JSON.stringify(b.field.values)}\n  err=${b.err}`));
  }

  // Test contacts
  const ccfv = tContact.custom_fields_values || [];
  if (ccfv.length > 0) {
    console.log('\n---- Binary search for bad contact fields ----');
    async function patchContact(fields) {
      try {
        const r = await axios.patch(`${BASE}/api/v4/contacts`, [{ id: KOMMO_CONTACT_ID, custom_fields_values: fields }], { headers });
        return { ok: true };
      } catch (e) { return { ok: false, err: JSON.stringify(e.response?.data) }; }
    }
    async function findBadC(fields) {
      if (fields.length === 0) return [];
      if (fields.length === 1) {
        const r = await patchContact(fields);
        if (!r.ok) return [{ field: fields[0], err: r.err }];
        return [];
      }
      const r = await patchContact(fields);
      if (r.ok) return [];
      const mid = Math.floor(fields.length / 2);
      return [...await findBadC(fields.slice(0, mid)), ...await findBadC(fields.slice(mid))];
    }
    const badC = await findBadC(ccfv);
    if (badC.length === 0) console.log('✅ All contact fields OK!');
    else badC.forEach(b => console.log(`  field_id=${b.field.field_id} values=${JSON.stringify(b.field.values)}\n  err=${b.err}`));
  }
}

main().catch(console.error);
