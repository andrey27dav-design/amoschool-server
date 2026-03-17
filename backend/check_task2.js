// check_task2.js - verify created contact task using correct dict format
const fse = require('fs-extra');
const axios = require('axios');
const path = require('path');

const KOMMO_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImFiNmFlNzdiNjI4NWQ1ZmYwNmM0MmY4ZjQ2NjRhYmU0NGNkNDgzMWJlZTRhNDM2MzI0NjEyZGY1N2FjZGNkYzUwNjRlYTFjNDk2ZDQxN2E3In0.eyJhdWQiOiI3MTU3NTZiYS00MTk3LTQ5MWItYTQ2MS0wOTlkMDJkNTdlMTYiLCJqdGkiOiJhYjZhZTc3YjYyODVkNWZmMDZjNDJmOGY0NjY0YWJlNDRjZDQ4MzFiZWU0YTQzNjMyNDYxMmRmNTdhY2RjZGM1MDY0ZWExYzQ5NmQ0MTdhNyIsImlhdCI6MTc3MTQ4NjExNiwibmJmIjoxNzcxNDg2MTE2LCJleHAiOjE4MzAyOTc2MDAsInN1YiI6IjEyNzM5Nzk1IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjM0MTkyNTIzLCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJjcm0iLCJmaWxlcyIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJwdXNoX25vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiM2ZmYzRmYjItOTRiNy00ZWFhLTkzY2QtMmU1YzU4ZWQwMjlmIiwiYXBpX2RvbWFpbiI6ImFwaS1nLmtvbW1vLmNvbSJ9.J-fe71D0ODNz_OvlZIJSP0dZ-DSN9qUUtCjDxmcm76l-X2oiKTrlQht6gPuPygEgbdezr-9DD5mqxdYAnVNi92eahqLTWAiVS9UmieiFc2duGnYwlKO3zJ44zd0hV_D29HTPawhNAjm3bur19FKYSV7teJKUCPdSVOkp_ew7I2TmEszKqvGTisWubplGz9wUROBefUzjCKGgMSXXhqZm27FHKE6RhAUTSagys6o09dxxh2gGktEXJ5BpoQ2Q3GX3y-I8YDPHs-R6bbxLz6SUol3s5fzobM9KNY1NgbNZ1297v43Wp2PUTLfgDY7fDX4d7zFjGFYlYjn-2XOvdFiTQA';
const KOMMO_HOST = 'https://helloshkolaonlinecom.kommo.com';
const INDEX_FILE = path.resolve('/var/www/amoschool/backend/backups/migration_index.json');

async function main() {
  const idx = fse.readJsonSync(INDEX_FILE);
  
  // tasks_contacts is a plain dict {amoId: kommoId}
  const taskContacts = idx.tasks_contacts || {};
  const entries = Object.entries(taskContacts);
  console.log(`Total contact tasks in index: ${entries.length}`);
  
  const last3 = entries.slice(-3);
  console.log('\nLast 3 contact task entries (amoId → kommoId):');
  last3.forEach(([amoId, kommoId]) => console.log(`  AMO#${amoId} → Kommo#${kommoId}`));
  
  if (last3.length === 0) {
    console.log('No contact tasks in index!');
    return;
  }
  
  // Check the latest task in Kommo
  const [lastAmoId, lastKommoId] = last3[last3.length - 1];
  console.log(`\nFetching latest contact task from Kommo (id=${lastKommoId})...`);
  
  try {
    const resp = await axios.get(`${KOMMO_HOST}/api/v4/tasks/${lastKommoId}`, {
      headers: { Authorization: `Bearer ${KOMMO_TOKEN}` }
    });
    const task = resp.data;
    console.log('\nKommo task details:');
    console.log(`  id: ${task.id}`);
    console.log(`  text: "${task.text}"`);
    console.log(`  is_completed: ${task.is_completed}`);
    console.log(`  complete_till: ${task.complete_till ? new Date(task.complete_till * 1000).toISOString() : 'none'}`);
    console.log(`  responsible_user_id: ${task.responsible_user_id}`);
    console.log(`  entity_id: ${task.entity_id}`);
    console.log(`  entity_type: ${task.entity_type}`);
    
    // Check date prefix
    const datePrefix = /^\[\d{2}\.\d{2}\.\d{4}\]/.test(task.text || '');
    console.log(`\n✅ Date prefix [DD.MM.YYYY] present: ${datePrefix}`);
    
    if (task.is_completed) {
      console.log('✅ Task is marked as completed (strikethrough in UI)');
    } else {
      console.log('⚡ Task is ACTIVE (not completed)');
      if (task.complete_till) {
        console.log('✅ Active task has deadline set');
      } else {
        console.log('❌ Active task has NO deadline!');
      }
    }
  } catch (e) {
    console.error('Error fetching task:', e.response?.data || e.message);
  }
  
  // Also check tasks_leads last 3
  const taskLeads = idx.tasks_leads || {};
  const leadEntries = Object.entries(taskLeads);
  const last3leads = leadEntries.slice(-3);
  console.log(`\n--- Lead tasks (last 3 of total ${leadEntries.length}) ---`);
  last3leads.forEach(([amoId, kommoId]) => console.log(`  AMO#${amoId} → Kommo#${kommoId}`));
}

main().catch(console.error);
