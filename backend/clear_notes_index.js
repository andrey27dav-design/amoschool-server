const fs = require('fs');
const path = require('path');

const indexPath = '/var/www/amoschool/backend/backups/migration_index.json';
const backupPath = '/var/www/amoschool/backend/backups/migration_index_backup_before_notes_reset.json';

// Читаем индекс
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

console.log('=== ТЕКУЩИЙ ИНДЕКС ===');
for (const [key, val] of Object.entries(index)) {
  if (typeof val === 'object') {
    console.log(`  ${key}: ${Object.keys(val).length} записей`);
  } else {
    console.log(`  ${key}: ${val}`);
  }
}

// Создаём резервную копию
fs.writeFileSync(backupPath, JSON.stringify(index, null, 2), 'utf8');
console.log('\n✅ Резервная копия сохранена:', backupPath);

// Очищаем ТОЛЬКО ноты (leads и contacts)
const notesBefore = Object.keys(index.notes_leads || {}).length;
const notesContactsBefore = Object.keys(index.notes_contacts || {}).length;

index.notes_leads = {};
index.notes_contacts = {};

fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');

console.log(`\n✅ Очищено notes_leads: ${notesBefore} записей удалено`);
console.log(`✅ Очищено notes_contacts: ${notesContactsBefore} записей удалено`);
console.log('\n=== ИНДЕКС ПОСЛЕ ОЧИСТКИ ===');
const newIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
for (const [key, val] of Object.entries(newIndex)) {
  if (typeof val === 'object') {
    console.log(`  ${key}: ${Object.keys(val).length} записей`);
  } else {
    console.log(`  ${key}: ${val}`);
  }
}
console.log('\n✅ Готово! Теперь можно запустить повторную миграцию — сделки/контакты/задачи пропустятся, все ноты создадутся заново.');
