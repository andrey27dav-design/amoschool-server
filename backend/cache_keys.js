const fse = require('fs-extra');
const c = fse.readJsonSync('/var/www/amoschool/backend/backups/amo_data_cache.json');
console.log('Top-level keys:', Object.keys(c));
for (const k of Object.keys(c)) {
  const v = c[k];
  if (Array.isArray(v)) {
    console.log(`  ${k}: array[${v.length}]`);
    if (v.length > 0 && typeof v[0] === 'object') {
      console.log(`    first keys: ${Object.keys(v[0]).slice(0,6).join(', ')}`);
    }
  } else {
    console.log(`  ${k}: ${typeof v}`);
  }
}
// Check tasks for lead 27212311
const tasks = [...(c.tasks||[]), ...(c.leadTasks||[]), ...(c.contactTasks||[])];
const t271 = tasks.filter(t => t.entity_id === 27212311 || String(t.entity_id) === '27212311');
console.log('\nTasks for lead 27212311:', t271.length);
const contacts = [27365697, 30703459];
const tContacts = tasks.filter(t => contacts.includes(t.entity_id) || contacts.includes(Number(t.entity_id)));
console.log('Tasks for contacts 27365697/30703459:', tContacts.length);
