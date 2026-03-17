const fs = require('fs');
const m = JSON.parse(fs.readFileSync('/var/www/amoschool/backend/backups/field_mapping.json', 'utf8'));
const leads = m.leads || {};
Object.entries(leads).forEach(([id, v]) => console.log(id, JSON.stringify(v)));
