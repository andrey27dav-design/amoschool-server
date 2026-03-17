// check-task-structure.js — анализ структуры задач из AMO кэша
const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, 'backups', 'amo_data_cache.json');
const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));

console.log('=== AMO TASK STRUCTURE ===');
console.log('leadTasks count:', (cache.leadTasks || []).length);
console.log('contactTasks count:', (cache.contactTasks || []).length);

const tasks = cache.leadTasks || [];

// Show first 3 lead tasks - ALL fields
console.log('\n--- First 3 leadTasks (all fields) ---');
for (let i = 0; i < Math.min(3, tasks.length); i++) {
  console.log('\nTask #' + i + ':', JSON.stringify(tasks[i], null, 2));
}

// All unique keys
const allKeys = new Set();
for (const t of tasks) {
  Object.keys(t).forEach(k => allKeys.add(k));
}
console.log('\nAll unique keys:', [...allKeys].sort().join(', '));

// task_type_id check
const hasTaskType = tasks.filter(t => t.task_type_id !== undefined);
console.log('\nTasks with task_type_id:', hasTaskType.length + '/' + tasks.length);

if (hasTaskType.length > 0) {
  const typeMap = {};
  for (const t of tasks) {
    const key = String(t.task_type_id || 'none');
    if (!typeMap[key]) typeMap[key] = { count: 0, texts: [] };
    typeMap[key].count++;
    if (typeMap[key].texts.length < 2) typeMap[key].texts.push(t.text || '');
  }
  console.log('\nTask type distribution:');
  for (const [id, info] of Object.entries(typeMap).sort((a,b) => b[1].count - a[1].count)) {
    console.log('  task_type_id=' + id + ': ' + info.count + ' tasks (texts: ' + JSON.stringify(info.texts) + ')');
  }
}

// is_completed check
const completed = tasks.filter(t => t.is_completed === true || t.is_completed === 1);
const active = tasks.filter(t => t.is_completed === false || t.is_completed === 0);
console.log('\nCompleted:', completed.length, ' Active:', active.length, ' Total:', tasks.length);

// Show 5 active tasks
if (active.length > 0) {
  console.log('\n--- First 5 ACTIVE tasks ---');
  for (let i = 0; i < Math.min(5, active.length); i++) {
    const t = active[i];
    console.log(JSON.stringify({
      id: t.id, task_type_id: t.task_type_id, task_type: t.task_type,
      text: t.text, is_completed: t.is_completed,
      complete_till: t.complete_till, entity_id: t.entity_id
    }));
  }
}
