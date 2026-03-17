// Run from /var/www/amoschool/backend
process.chdir('/var/www/amoschool/backend');
require('dotenv').config();
const amo = require('./src/services/amoApiV2');
(async () => {
  const [users, groups] = await Promise.all([amo.getUsers(), amo.getGroups()]);
  console.log('=== GROUPS ===');
  for (const g of groups) {
    console.log(`  ${g.id} | ${g.name}`);
  }
  console.log('=== USERS ===');
  for (const u of users) {
    console.log(`  ${u.id} | ${u.name} | ${u.email} | group_id=${u.group_id} | active=${u.is_active}`);
  }
})().catch(e => console.error('ERROR:', e.message));
