// check-amo-task-full.js — полная структура задач из AMO кэша
const fs = require('fs');
const cache = JSON.parse(fs.readFileSync('/var/www/amoschool/backend/backups/amo_data_cache.json', 'utf8'));

const tasks = cache.leadTasks || [];
console.log('Total leadTasks:', tasks.length);

// Показать ВСЕ ключи первой задачи
if (tasks.length > 0) {
  console.log('\n=== ALL KEYS of first task ===');
  console.log(Object.keys(tasks[0]).sort().join('\n'));
  console.log('\n=== FULL first task JSON ===');
  console.log(JSON.stringify(tasks[0], null, 2));
}

// Найти все уникальные task_type_id и показать полный объект для каждого типа
var typeMap = {};
tasks.forEach(function(t) {
  var tid = t.task_type_id;
  if (!typeMap[tid]) {
    typeMap[tid] = { count: 0, sample: t };
  }
  typeMap[tid].count++;
});

console.log('\n=== SAMPLE TASK FOR EACH task_type_id ===');
Object.keys(typeMap).forEach(function(tid) {
  var item = typeMap[tid];
  console.log('\n--- task_type_id=' + tid + ' (count=' + item.count + ') ---');
  // Show key fields that might contain the type name
  var t = item.sample;
  console.log('  task_type:', JSON.stringify(t.task_type));
  console.log('  task_type_id:', t.task_type_id);
  console.log('  task_type_name:', JSON.stringify(t.task_type_name));
  console.log('  type:', JSON.stringify(t.type));
  console.log('  type_id:', JSON.stringify(t.type_id));
  console.log('  text:', JSON.stringify((t.text || '').substring(0, 100)));
  console.log('  result:', JSON.stringify(t.result));
  // Show ALL fields that contain "type" in key name
  Object.keys(t).forEach(function(k) {
    if (k.toLowerCase().indexOf('type') !== -1) {
      console.log('  [type-field] ' + k + ':', JSON.stringify(t[k]));
    }
  });
  // Show ALL string fields (possible name fields)
  Object.keys(t).forEach(function(k) {
    if (typeof t[k] === 'string' && t[k].length > 0 && k !== 'text' && k !== 'result') {
      console.log('  [string] ' + k + ':', JSON.stringify(t[k]));
    }
  });
});

// Also check if there's a separate task_types collection in cache
console.log('\n=== Cache top-level keys ===');
console.log(Object.keys(cache).join('\n'));

// Check for task_types
if (cache.task_types) {
  console.log('\n=== cache.task_types ===');
  console.log(JSON.stringify(cache.task_types, null, 2));
}
if (cache.taskTypes) {
  console.log('\n=== cache.taskTypes ===');
  console.log(JSON.stringify(cache.taskTypes, null, 2));
}
