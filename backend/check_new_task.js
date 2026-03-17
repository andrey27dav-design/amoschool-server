// check_new_task.js - find and verify the contact task created during virtual test
const fse = require('fs-extra');
const axios = require('axios');
const path = require('path');

const KOMMO_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImFiNmFlNzdiNjI4NWQ1ZmYwNmM0MmY4ZjQ2NjRhYmU0NGNkNDgzMWJlZTRhNDM2MzI0NjEyZGY1N2FjZGNkYzUwNjRlYTFjNDk2ZDQxN2E3In0.eyJhdWQiOiI3MTU3NTZiYS00MTk3LTQ5MWItYTQ2MS0wOTlkMDJkNTdlMTYiLCJqdGkiOiJhYjZhZTc3YjYyODVkNWZmMDZjNDJmOGY0NjY0YWJlNDRjZDQ4MzFiZWU0YTQzNjMyNDYxMmRmNTdhY2RjZGM1MDY0ZWExYzQ5NmQ0MTdhNyIsImlhdCI6MTc3MTQ4NjExNiwibmJmIjoxNzcxNDg2MTE2LCJleHAiOjE4MzAyOTc2MDAsInN1YiI6IjEyNzM5Nzk1IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjM0MTkyNTIzLCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJjcm0iLCJmaWxlcyIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJwdXNoX25vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiM2ZmYzRmYjItOTRiNy00ZWFhLTkzY2QtMmU1YzU4ZWQwMjlmIiwiYXBpX2RvbWFpbiI6ImFwaS1nLmtvbW1vLmNvbSJ9.J-fe71D0ODNz_OvlZIJSP0dZ-DSN9qUUtCjDxmcm76l-X2oiKTrlQht6gPuPygEgbdezr-9DD5mqxdYAnVNi92eahqLTWAiVS9UmieiFc2duGnYwlKO3zJ44zd0hV_D29HTPawhNAjm3bur19FKYSV7teJKUCPdSVOkp_ew7I2TmEszKqvGTisWubplGz9wUROBefUzjCKGgMSXXhqZm27FHKE6RhAUTSagys6o09dxxh2gGktEXJ5BpoQ2Q3GX3y-I8YDPHs-R6bbxLz6SUol3s5fzobM9KNY1NgbNZ1297v43Wp2PUTLfgDY7fDX4d7zFjGFYlYjn-2XOvdFiTQA';
const KOMMO_HOST = 'https://helloshkolaonlinecom.kommo.com';
const INDEX_FILE = '/var/www/amoschool/backend/backups/migration_index.json';
const CACHE_FILE = '/var/www/amoschool/backend/backups/amo_data_cache.json';

async function fetchKommoTask(taskId) {
  try {
    const resp = await axios.get(`${KOMMO_HOST}/api/v4/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${KOMMO_TOKEN}` }
    });
    // Kommo tasks API may return task directly or in _embedded
    const data = resp.data;
    if (!data) return null;
    if (data.id) return data;
    if (data._embedded && data._embedded.tasks && data._embedded.tasks[0]) return data._embedded.tasks[0];
    // Try to parse if string
    if (typeof data === 'string' && data.trim()) {
      const parsed = JSON.parse(data);
      return parsed.id ? parsed : null;
    }
    return null;
  } catch (e) {
    if (e.response && e.response.status === 404) return null;
    throw e;
  }
}

async function main() {
  const idx = fse.readJsonSync(INDEX_FILE);
  const cache = fse.readJsonSync(CACHE_FILE);
  
  // Step 1: Find the test lead (AMO #30124057) contact
  const lead30124057 = (cache.leads || []).find(l => l.id === 30124057);
  if (!lead30124057) {
    console.log('Lead 30124057 not in cache!');
    return;
  }
  const contactIds = ((lead30124057._embedded && lead30124057._embedded.contacts) || []).map(c => c.id);
  console.log(`Lead 30124057 contacts: ${contactIds.join(', ')}`);
  
  // Step 2: Find contact tasks for those contacts
  const contactTasksForLead = (cache.tasks || []).filter(
    t => t.entity_type === 'contacts' && contactIds.includes(t.entity_id)
  );
  console.log(`Contact tasks for lead's contacts: ${contactTasksForLead.length}`);
  contactTasksForLead.forEach(t => {
    console.log(`  AMO task #${t.id}: "${t.text}" completed=${t.is_completed}`);
    const kommoId = (idx.tasks_contacts || {})[String(t.id)];
    console.log(`  → Kommo task ID in index: ${kommoId || 'NOT FOUND'}`);
  });
  
  // Step 3: Total count now
  const ctEntries = Object.entries(idx.tasks_contacts || {});
  console.log(`\nTotal entries in tasks_contacts index: ${ctEntries.length}`);
  
  // Step 4: Find and verify the Kommo task for the first contact task of lead 30124057
  for (const t of contactTasksForLead) {
    const kommoId = (idx.tasks_contacts || {})[String(t.id)];
    if (!kommoId) {
      console.log(`\n❌ AMO task #${t.id} NOT in index (registration failed)`);
      continue;
    }
    
    console.log(`\nFetching Kommo task #${kommoId} for AMO task #${t.id}...`);
    
    // Try the tasks list endpoint which is more reliable
    try {
      const resp = await axios.get(`${KOMMO_HOST}/api/v4/tasks`, {
        params: { 'filter[id][]': kommoId },
        headers: { Authorization: `Bearer ${KOMMO_TOKEN}` }
      });
      const tasks = resp.data && resp.data._embedded && resp.data._embedded.tasks;
      const task = tasks && tasks[0];
      if (task) {
        console.log(`✅ Found task in Kommo:`);
        console.log(`   id: ${task.id}`);
        console.log(`   text: "${task.text}"`);
        console.log(`   is_completed: ${task.is_completed}`);
        console.log(`   complete_till: ${task.complete_till ? new Date(task.complete_till * 1000).toLocaleString('ru-RU') : 'none'}`);
        console.log(`   responsible_user_id: ${task.responsible_user_id}`);
        console.log(`   entity_id: ${task.entity_id}`);
        console.log(`   entity_type: ${task.entity_type}`);
        
        const datePrefix = /^\[\d{2}\.\d{2}\.\d{4}\]/.test(task.text || '');
        console.log(`\n   Date prefix [DD.MM.YYYY]: ${datePrefix ? '✅ YES' : '❌ NO'}`);
        if (t.is_completed) {
          console.log(`   AMO task was completed. Kommo is_completed: ${task.is_completed ? '✅ YES' : '❌ NO'}`);
        } else {
          console.log(`   AMO task is active. Deadline in Kommo: ${task.complete_till ? '✅ YES' : '❌ NO'}`);
        }
      } else {
        console.log(`❌ Task not found in Kommo (empty response)`);
        console.log(`   Raw data: ${JSON.stringify(resp.data)}`);
      }
    } catch(e) {
      console.error(`Error: ${e.response?.data ? JSON.stringify(e.response.data) : e.message}`);
    }
  }
}

main().catch(console.error);
