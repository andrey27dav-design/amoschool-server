const fs = require('fs');
const idx = JSON.parse(fs.readFileSync('/var/www/amoschool/backend/backups/migration_index.json', 'utf8'));
const leads = idx.leads || {};
const notes = idx.notes_leads || {};

console.log('=== Маппинг сделок ===');
console.log('AMO 22595523 -> Kommo:', leads['22595523'] || 'НЕТ В ИНДЕКСЕ');

const pair = Object.entries(leads).find(([k, v]) => v == 18287791);
console.log('Kommo 18287791 = AMO:', pair ? pair[0] : 'НЕТ В ИНДЕКСЕ');

console.log('\n=== notes_leads ===');
console.log('записей:', Object.keys(notes).length);
// Первые 10
Object.entries(notes).slice(0, 10).forEach(([k, v]) => console.log(` AMO note ${k} -> Kommo note ${v}`));
