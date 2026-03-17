const b = JSON.parse(require('fs').readFileSync('/var/www/amoschool/backend/backups/migration_index_backup_before_notes_reset.json'));
console.log('keys:', Object.keys(b));
const nl = b.notes_leads;
console.log('notes_leads type:', typeof nl, Array.isArray(nl));
console.log('notes_leads sample:', JSON.stringify(nl).slice(0, 400));
