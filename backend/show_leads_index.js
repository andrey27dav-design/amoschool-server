const fs = require('fs');
const https = require('https');

const index = JSON.parse(fs.readFileSync('/var/www/amoschool/backend/backups/migration_index.json', 'utf8'));
const leads = index.leads || {};

console.log('Всего сделок в индексе:', Object.keys(leads).length);
console.log('');
console.log('AMO_ID -> KOMMO_ID');
for (const [amoId, kommoId] of Object.entries(leads)) {
  console.log(`  AMO:${amoId} -> Kommo:${kommoId}`);
}
