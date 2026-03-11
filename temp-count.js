const d = require("/var/www/amoschool/backend/backups/migration_index.json");
console.log("leads:", Object.keys(d.leads || {}).length);
console.log("baseline:", require("/var/www/amoschool/backend/backups/session_baseline.json"));
