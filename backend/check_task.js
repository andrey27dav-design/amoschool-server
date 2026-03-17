const fse = require('fs-extra');
const axios = require('axios');

async function main() {
  const idx = fse.readJsonSync('/var/www/amoschool/backend/backups/migration_index.json');
  const ct = idx.tasks_contacts || {};
  const pairs = (ct.pairs || []).slice(-5);
  console.log('Last contact task pairs:', JSON.stringify(pairs));
  
  if (pairs.length === 0) {
    console.log('No contact tasks registered yet');
    return;
  }
  
  const lastPair = pairs[pairs.length - 1];
  console.log('Last created contact task Kommo ID:', lastPair.kommoId);
  
  // Check Kommo task
  const token = process.env.KOMMO_TOKEN;
  const res = await axios.get('https://helloshkolaonlinecom.kommo.com/api/v4/tasks/' + lastPair.kommoId, {
    headers: { Authorization: 'Bearer ' + token }
  });
  const task = res.data;
  console.log('\nTask in Kommo:');
  console.log('  id:', task.id);
  console.log('  entity_type:', task.entity_type);
  console.log('  entity_id:', task.entity_id);
  console.log('  is_completed:', task.is_completed);
  console.log('  text:', task.text);
  
  const hasDatePrefix = !!(task.text && task.text.match(/^\[\d\d\.\d\d\.\d{4}\]/));
  console.log('  Date prefix:', hasDatePrefix ? 'OK' : 'MISSING');
  console.log(hasDatePrefix ? 'PASS: Date prefix in task text' : 'FAIL: No date prefix');
}

require('dotenv').config({ path: '/var/www/amoschool/backend/.env' });
main().catch(e => console.error('Error:', e.message));
