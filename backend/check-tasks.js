/**
 * check-tasks.js — показать структуру задач из amo_data_cache.json
 * Запускать из /var/www/amoschool/backend/
 */
const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, 'backups', 'amo_data_cache.json');
const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));

// Берём только задачи сделок
const leadTasks = cache.leadTasks || [];
console.log(`=== leadTasks: ${leadTasks.length} total ===\n`);

// Показать первые 5 задач полностью
const sample = leadTasks.slice(-5); // последние 5
for (const t of sample) {
  console.log(JSON.stringify(t, null, 2));
  console.log('---');
}

// Собрать уникальные task_type_id
const typeIds = new Set();
const typeNames = {};
let activeCount = 0;
let completedCount = 0;

for (const t of leadTasks) {
  if (t.task_type_id !== undefined) typeIds.add(t.task_type_id);
  if (t.task_type) {
    typeNames[t.task_type_id || 'unknown'] = t.task_type;
  }
  // is_completed или result
  if (t.is_completed || t.result) completedCount++;
  else activeCount++;
}

console.log('\n=== Task type IDs found ===');
console.log([...typeIds]);
console.log('\n=== Task type names ===');
console.log(typeNames);
console.log(`\nActive: ${activeCount}, Completed: ${completedCount}`);

// Показать все уникальные ключи объекта задачи
const allKeys = new Set();
for (const t of leadTasks) {
  for (const k of Object.keys(t)) allKeys.add(k);
}
console.log('\n=== All task object keys ===');
console.log([...allKeys].sort());
