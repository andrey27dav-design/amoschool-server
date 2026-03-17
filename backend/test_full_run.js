// Full dry-run test for deal #31635363 → already migrated to Kommo #18219421
// Tests: updateLead, updateContact, updateCompany, linkContact, linkCompany, notes
const axios = require('axios');

const AMO_TOKEN  = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImI5MGYyZjIxNTIxMGQxNGQ0MTg0NDRhODBkMzBjODlkOTcwMmU4NTBmNjk5YTg3ODk4ODQ5ZmNiMWM1ZWJlZmRjZjAwNGY5ZmQzNzA4Zjg1In0.eyJhdWQiOiJmYzNmMTU4NS0zM2E0LTQwOTMtOTE1Zi0xMWE0OGE1OWUwY2MiLCJqdGkiOiJiOTBmMmYyMTUyMTBkMTRkNDE4NDQ0YTgwZDMwYzg5ZDk3MDJlODUwZjY5OWE4Nzg5ODg0OWZjYjFjNWViZWZkY2YwMDRmOWZkMzcwOGY4NSIsImlhdCI6MTc3MTQ4NjU4MiwibmJmIjoxNzcxNDg2NTgyLCJleHAiOjE4MzAyOTc2MDAsInN1YiI6IjYyMTc3NjgiLCJncmFudF90eXBlIjoiIiwiYWNjb3VudF9pZCI6Mjg5ODcyNTIsImJhc2VfZG9tYWluIjoiYW1vY3JtLnJ1IiwidmVyc2lvbiI6Miwic2NvcGVzIjpbImNybSIsImZpbGVzIiwiZmlsZXNfZGVsZXRlIiwibm90aWZpY2F0aW9ucyIsInB1c2hfbm90aWZpY2F0aW9ucyJdLCJoYXNoX3V1aWQiOiI5ZDFmYzQ2Zi02ZGRhLTRiMjItYTZkYy0zNzJiYTI5YTU1YjEiLCJhcGlfZG9tYWluIjoiYXBpLWIuYW1vY3JtLnJ1In0.HiQPlgnA5h_YEplP4MawVuktKA0wgKWT4Gag-JHIn3yt-0E-q7GO_At0L4ZSV044-R8r9qRFfl5IFUIzx1sB_xXGVdckukIYbjUpfUAy1iRChC2fGWJ7ATjZaR8sQT6tcBXB6wnDJCOoWZgEtJaOyUASvDm_TTltATuieUkSOJ5FQvc2ggfRZ4x_KjFCvAlmwoMeRJv0t3YUXv7PZ4DRJxR7CdW0SQge3hWFmDXi_HBW8e-eP2cLNp3hw_iA7r_xb1LGGYba3fS8_HzBJEnxxnoPiYnxywqK6Ug3ZxpO-SfXyI5IwrwM62q9W6ElZ5ZVPBjkpaKAOclnrO_SUfRlNA';
const KOMMO_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImFiNmFlNzdiNjI4NWQ1ZmYwNmM0MmY4ZjQ2NjRhYmU0NGNkNDgzMWJlZTRhNDM2MzI0NjEyZGY1N2FjZGNkYzUwNjRlYTFjNDk2ZDQxN2E3In0.eyJhdWQiOiI3MTU3NTZiYS00MTk3LTQ5MWItYTQ2MS0wOTlkMDJkNTdlMTYiLCJqdGkiOiJhYjZhZTc3YjYyODVkNWZmMDZjNDJmOGY0NjY0YWJlNDRjZDQ4MzFiZWU0YTQzNjMyNDYxMmRmNTdhY2RjZGM1MDY0ZWExYzQ5NmQ0MTdhNyIsImlhdCI6MTc3MTQ4NjExNiwibmJmIjoxNzcxNDg2MTE2LCJleHAiOjE4MzAyOTc2MDAsInN1YiI6IjEyNzM5Nzk1IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjM0MTkyNTIzLCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJjcm0iLCJmaWxlcyIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJwdXNoX25vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiM2ZmYzRmYjItOTRiNy00ZWFhLTkzY2QtMmU1YzU4ZWQwMjlmIiwiYXBpX2RvbWFpbiI6ImFwaS1nLmtvbW1vLmNvbSJ9.J-fe71D0ODNz_OvlZIJSP0dZ-DSN9qUUtCjDxmcm76l-X2oiKTrlQht6gPuPygEgbdezr-9DD5mqxdYAnVNi92eahqLTWAiVS9UmieiFc2duGnYwlKO3zJ44zd0hV_D29HTPawhNAjm3bur19FKYSV7teJKUCPdSVOkp_ew7I2TmEszKqvGTisWubplGz9wUROBefUzjCKGgMSXXhqZm27FHKE6RhAUTSagys6o09dxxh2gGktEXJ5BpoQ2Q3GX3y-I8YDPHs-R6bbxLz6SUol3s5fzobM9KNY1NgbNZ1297v43Wp2PUTLfgDY7fDX4d7zFjGFYlYjn-2XOvdFiTQA';
const KOMMO_BASE = 'https://helloshkolaonlinecom.kommo.com';
const headers = { Authorization: `Bearer ${KOMMO_TOKEN}`, 'Content-Type': 'application/json' };

const cache     = require('/var/www/amoschool/backend/backups/amo_data_cache.json');
const mapping   = require('/var/www/amoschool/backend/backups/field_mapping.json');
const { transformLead, transformContact, transformCompany } = require('/var/www/amoschool/backend/src/utils/dataTransformer');

// IDs
const AMO_LEAD_ID      = 31635363;  const KOMMO_LEAD_ID    = 18219421;
const AMO_CONTACT_ID   = 32191201;  const KOMMO_CONTACT_ID = 21177497;
const AMO_COMPANY_ID   = 32191323;  const KOMMO_COMPANY_ID = 21177265;

async function patch(url, body, label) {
  try {
    const r = await axios.patch(`${KOMMO_BASE}${url}`, body, { headers });
    console.log(`✅ ${label}: ${r.status}`);
    return r.data;
  } catch (e) {
    const errData = e.response?.data;
    const valErrs = errData?.['validation-errors'];
    console.log(`❌ ${label}: ${e.response?.status}`);
    if (valErrs) {
      for (const ve of valErrs) {
        for (const err of (ve.errors || [])) {
          console.log(`   path=${err.path} code=${err.code} detail=${err.detail}`);
        }
      }
    } else {
      console.log('   ', JSON.stringify(errData));
    }
    return null;
  }
}

async function post(url, body, label) {
  try {
    const r = await axios.post(`${KOMMO_BASE}${url}`, body, { headers });
    console.log(`✅ ${label}: ${r.status}`);
    return r.data;
  } catch (e) {
    const errData = e.response?.data;
    console.log(`❌ ${label}: ${e.response?.status}`, JSON.stringify(errData));
    return null;
  }
}

async function run() {
  // --- Get source data ---
  const lead    = cache.leads.find(l => l.id === AMO_LEAD_ID);
  const contact = cache.contacts.find(c => c.id === AMO_CONTACT_ID);
  const company = cache.companies.find(c => c.id === AMO_COMPANY_ID);
  console.log(`\nSource: lead="${lead?.name}", contact="${contact?.name}", company="${company?.name}"`);

  const stageMap = {};
  const tLead    = transformLead(lead, stageMap, mapping.leads);
  const tContact = transformContact(contact, mapping.contacts);
  const tCompany = transformCompany(company, mapping.companies);

  console.log(`\nTransformed lead CFV count: ${tLead.custom_fields_values?.length || 0}`);
  console.log(`Transformed contact CFV count: ${tContact.custom_fields_values?.length || 0}`);
  console.log(`Transformed company CFV count: ${tCompany.custom_fields_values?.length || 0}`);

  // --- 1. Update lead custom fields ---
  console.log('\n--- 1. Update lead custom fields ---');
  if (tLead.custom_fields_values?.length) {
    console.log('Payload sample (first 3 fields):');
    console.log(JSON.stringify(tLead.custom_fields_values.slice(0, 3), null, 2));
    await patch('/api/v4/leads', [{ id: KOMMO_LEAD_ID, custom_fields_values: tLead.custom_fields_values }], 'updateLead CFV');
  } else {
    console.log('No custom fields to update');
  }

  // --- 2. Update contact custom fields ---
  console.log('\n--- 2. Update contact custom fields ---');
  if (tContact.custom_fields_values?.length) {
    console.log('Payload sample (first 3 fields):');
    console.log(JSON.stringify(tContact.custom_fields_values.slice(0, 3), null, 2));
    await patch('/api/v4/contacts', [{ id: KOMMO_CONTACT_ID, custom_fields_values: tContact.custom_fields_values }], 'updateContact CFV');
  }

  // --- 3. Update company custom fields ---
  console.log('\n--- 3. Update company custom fields ---');
  if (tCompany.custom_fields_values?.length) {
    console.log('Payload sample:', JSON.stringify(tCompany.custom_fields_values, null, 2));
    await patch('/api/v4/companies', [{ id: KOMMO_COMPANY_ID, custom_fields_values: tCompany.custom_fields_values }], 'updateCompany CFV');
  } else {
    console.log('No company custom fields');
  }

  // --- 4. Link contact to lead ---
  console.log('\n--- 4. Link contact to lead ---');
  await patch('/api/v4/leads', [{ id: KOMMO_LEAD_ID, _embedded: { contacts: [{ id: KOMMO_CONTACT_ID }] } }], 'linkContact');

  // --- 5. Link company to lead ---
  console.log('\n--- 5. Link company to lead ---');
  await patch('/api/v4/leads', [{ id: KOMMO_LEAD_ID, _embedded: { companies: [{ id: KOMMO_COMPANY_ID }] } }], 'linkCompany');

  // --- 6. Post contact notes (first 2) ---
  console.log('\n--- 6. Contact notes ---');
  const contactNotes = (cache.contactNotes || []).filter(n => n.entity_id === AMO_CONTACT_ID).slice(0, 2);
  console.log(`Found ${contactNotes.length} notes for contact ${AMO_CONTACT_ID}`);
  for (const note of contactNotes) {
    const payload = [{ entity_id: KOMMO_CONTACT_ID, note_type: 'common', params: { text: note.params?.text || '[note]' } }];
    await post('/api/v4/contacts/notes', payload, `note type=${note.note_type}`);
  }
}

run().catch(e => { console.error('FATAL:', e.message); });
