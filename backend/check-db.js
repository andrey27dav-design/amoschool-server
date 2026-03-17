const Database = require('better-sqlite3');
const db = new Database('/var/www/amoschool/backups/migration.db', { readonly: true });

console.log('=== pipeline_selection ===');
const ps = db.prepare('SELECT * FROM pipeline_selection').all();
ps.forEach(r => console.log(JSON.stringify(r)));

console.log('\n=== stage_mapping ===');
const sm = db.prepare('SELECT * FROM stage_mapping').all();
sm.forEach(r => console.log(JSON.stringify(r)));

console.log('\n=== user_mapping ===');
const um = db.prepare('SELECT * FROM user_mapping').all();
um.forEach(r => console.log(JSON.stringify(r)));

db.close();
