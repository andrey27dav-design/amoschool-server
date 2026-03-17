/**
 * delete_duplicate_notes.js
 * Reads the backup index (saved before notes index reset),
 * extracts old Kommo note IDs, and deletes them via Kommo API.
 * This removes V1.5.17 notes, leaving only fresh V1.5.18 notes (with call dates).
 */

const https = require('https');
const fs = require('fs');

const KOMMO_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImFiNmFlNzdiNjI4NWQ1ZmYwNmM0MmY4ZjQ2NjRhYmU0NGNkNDgzMWJlZTRhNDM2MzI0NjEyZGY1N2FjZGNkYzUwNjRlYTFjNDk2ZDQxN2E3In0.eyJhdWQiOiI3MTU3NTZiYS00MTk3LTQ5MWItYTQ2MS0wOTlkMDJkNTdlMTYiLCJqdGkiOiJhYjZhZTc3YjYyODVkNWZmMDZjNDJmOGY0NjY0YWJlNDRjZDQ4MzFiZWU0YTQzNjMyNDYxMmRmNTdhY2RjZGM1MDY0ZWExYzQ5NmQ0MTdhNyIsImlhdCI6MTc3MTQ4NjExNiwibmJmIjoxNzcxNDg2MTE2LCJleHAiOjE4MzAyOTc2MDAsInN1YiI6IjEyNzM5Nzk1IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjM0MTkyNTIzLCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJjcm0iLCJmaWxlcyIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJwdXNoX25vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiM2ZmYzRmYjItOTRiNy00ZWFhLTkzY2QtMmU1YzU4ZWQwMjlmIiwiYXBpX2RvbWFpbiI6ImFwaS1nLmtvbW1vLmNvbSJ9.J-fe71D0ODNz_OvlZIJSP0dZ-DSN9qUUtCjDxmcm76l-X2oiKTrlQht6gPuPygEgbdezr-9DD5mqxdYAnVNi92eahqLTWAiVS9UmieiFc2duGnYwlKO3zJ44zd0hV_D29HTPawhNAjm3bur19FKYSV7teJKUCPdSVOkp_ew7I2TmEszKqvGTisWubplGz9wUROBefUzjCKGgMSXXhqZm27FHKE6RhAUTSagys6o09dxxh2gGktEXJ5BpoQ2Q3GX3y-I8YDPHs-R6bbxLz6SUol3s5fzobM9KNY1NgbNZ1297v43Wp2PUTLfgDY7fDX4d7zFjGFYlYjn-2XOvdFiTQA';
const KOMMO_DOMAIN = 'api-g.kommo.com';

const BACKUP_PATH = '/var/www/amoschool/backend/backups/migration_index_backup_before_notes_reset.json';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function kommoRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: KOMMO_DOMAIN,
      path,
      method,
      headers: {
        'Authorization': `Bearer ${KOMMO_TOKEN}`,
        'Content-Type': 'application/json',
      }
    };
    if (bodyStr) options.headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const req = https.request(options, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        resolve({ status: res.statusCode, body: data });
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function deleteNotesForEntity(entityType, noteIds) {
  // entityType: 'leads' or 'contacts'
  let deleted = 0, errors = 0;
  for (let i = 0; i < noteIds.length; i++) {
    const id = noteIds[i];
    const res = await kommoRequest('DELETE', `/api/v4/${entityType}/notes/${id}`, null);
    if (res.status === 204 || res.status === 200) {
      deleted++;
      if (deleted % 10 === 0) console.log(`  [${entityType}] Deleted ${deleted}/${noteIds.length}...`);
    } else {
      console.log(`  [${entityType}] WARN id=${id} status=${res.status}`);
      errors++;
    }
    await sleep(150);
  }
  return { deleted, errors };
}

async function main() {
  console.log('=== DELETE DUPLICATE NOTES (old V1.5.17 notes) ===\n');

  const backup = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));

  // Extract old Kommo note IDs (format: { amoId: kommoId })
  const leadNoteKommoIds = Object.values(backup.notes_leads || {}).map(Number).filter(Boolean);
  const contactNoteKommoIds = Object.values(backup.notes_contacts || {}).map(Number).filter(Boolean);

  console.log(`Found in backup:`);
  console.log(`  notes_leads:    ${leadNoteKommoIds.length} old Kommo IDs`);
  console.log(`  notes_contacts: ${contactNoteKommoIds.length} old Kommo IDs\n`);

  if (leadNoteKommoIds.length === 0 && contactNoteKommoIds.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  // Delete lead notes
  if (leadNoteKommoIds.length > 0) {
    console.log(`Deleting ${leadNoteKommoIds.length} old lead notes...`);
    const r = await deleteNotesForEntity('leads', leadNoteKommoIds);
    console.log(`  → deleted: ${r.deleted}, errors: ${r.errors}\n`);
  }

  // Delete contact notes
  if (contactNoteKommoIds.length > 0) {
    console.log(`Deleting ${contactNoteKommoIds.length} old contact notes...`);
    const r = await deleteNotesForEntity('contacts', contactNoteKommoIds);
    console.log(`  → deleted: ${r.deleted}, errors: ${r.errors}\n`);
  }

  console.log('=== DONE ===');
  console.log('New notes (V1.5.18 with call dates) remain intact.');
}

main().catch(console.error);
