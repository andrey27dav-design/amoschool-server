// find_new_ct.js - find new contact task created during test
const fse = require('fs-extra');
const axios = require('axios');

const IDX = '/var/www/amoschool/backend/backups/migration_index.json';
const CACHE = '/var/www/amoschool/backend/backups/amo_data_cache.json';
const KOMMO_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImFiNmFlNzdiNjI4NWQ1ZmYwNmM0MmY4ZjQ2NjRhYmU0NGNkNDgzMWJlZTRhNDM2MzI0NjEyZGY1N2FjZGNkYzUwNjRlYTFjNDk2ZDQxN2E3In0.eyJhdWQiOiI3MTU3NTZiYS00MTk3LTQ5MWItYTQ2MS0wOTlkMDJkNTdlMTYiLCJqdGkiOiJhYjZhZTc3YjYyODVkNWZmMDZjNDJmOGY0NjY0YWJlNDRjZDQ4MzFiZWU0YTQzNjMyNDYxMmRmNTdhY2RjZGM1MDY0ZWExYzQ5NmQ0MTdhNyIsImlhdCI6MTc3MTQ4NjExNiwibmJmIjoxNzcxNDg2MTE2LCJleHAiOjE4MzAyOTc2MDAsInN1YiI6IjEyNzM5Nzk1IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjM0MTkyNTIzLCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJjcm0iLCJmaWxlcyIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJwdXNoX25vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiM2ZmYzRmYjItOTRiNy00ZWFhLTkzY2QtMmU1YzU4ZWQwMjlmIiwiYXBpX2RvbWFpbiI6ImFwaS1nLmtvbW1vLmNvbSJ9.J-fe71D0ODNz_OvlZIJSP0dZ-DSN9qUUtCjDxmcm76l-X2oiKTrlQht6gPuPygEgbdezr-9DD5mqxdYAnVNi92eahqLTWAiVS9UmieiFc2duGnYwlKO3zJ44zd0hV_D29HTPawhNAjm3bur19FKYSV7teJKUCPdSVOkp_ew7I2TmEszKqvGTisWubplGz9wUROBefUzjCKGgMSXXhqZm27FHKE6RhAUTSagys6o09dxxh2gGktEXJ5BpoQ2Q3GX3y-I8YDPHs-R6bbxLz6SUol3s5fzobM9KNY1NgbNZ1297v43Wp2PUTLfgDY7fDX4d7zFjGFYlYjn-2XOvdFiTQA';
const KOMMO_HOST = 'https://helloshkolaonlinecom.kommo.com';

async function main() {
  const idx = fse.readJsonSync(IDX);
  const cache = fse.readJsonSync(CACHE);
  const allTasks = cache.tasks || [];

  // Count
  const ctDict = idx.tasks_contacts || {};
  const ctEntries = Object.entries(ctDict);
  console.log('Total tasks_contacts:', ctEntries.length);

  // Find contact tasks for contact 30537435 (entity_id as string or number)
  const cTasks = allTasks.filter(t => {
    return t.entity_type === 'contacts' && String(t.entity_id) === '30537435';
  });
  console.log('Contact tasks for 30537435 in cache:', cTasks.length);
  cTasks.forEach(t => {
    const kommoId = ctDict[String(t.id)];
    console.log(`  AMO task #${t.id} "${t.text && t.text.substring(0,40)}" completed=${t.is_completed} → Kommo#${kommoId || 'NOT INDEXED'}`);
  });

  // Sort ctEntries by kommoId (descending) to find recent ones
  const sortedByKommoId = ctEntries.sort((a, b) => Number(b[1]) - Number(a[1]));
  console.log('\nTop 5 by highest Kommo task ID (most recently created):');
  sortedByKommoId.slice(0, 5).forEach(([amoId, kommoId]) => {
    console.log(`  AMO#${amoId} → Kommo#${kommoId}`);
  });

  // Fetch the highest Kommo task ID
  const topKommoId = sortedByKommoId[0][1];
  console.log(`\nFetching top Kommo task #${topKommoId}...`);
  try {
    const resp = await axios.get(`${KOMMO_HOST}/api/v4/tasks`, {
      params: { 'filter[id][]': topKommoId },
      headers: { Authorization: `Bearer ${KOMMO_TOKEN}` }
    });
    const tasks = resp.data && resp.data._embedded && resp.data._embedded.tasks;
    const task = tasks && tasks[0];
    if (task) {
      console.log(`id: ${task.id}`);
      console.log(`text: "${task.text}"`);
      console.log(`is_completed: ${task.is_completed}`);
      console.log(`complete_till: ${task.complete_till}`);
      console.log(`entity_id: ${task.entity_id}, entity_type: ${task.entity_type}`);
      const datePrefix = /^\[\d{2}\.\d{2}\.\d{4}\]/.test(task.text || '');
      console.log(`\n▶ Date prefix [DD.MM.YYYY]: ${datePrefix ? '✅ YES' : '❌ NO'}`);
      console.log(`▶ is_completed: ${task.is_completed ? '✅ YES (strikethrough)' : '❌ NO'}`);
    } else {
      console.log('Empty response, checking raw:');
      console.log(JSON.stringify(resp.data).substring(0, 200));
    }
  } catch(e) {
    console.error('Error:', e.response ? JSON.stringify(e.response.data) : e.message);
  }
}

main().catch(console.error);
