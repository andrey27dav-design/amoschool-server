// check-task-types-kommo.js — получить список типов задач из Kommo + задачи сделки
const axios = require('axios');
const config = require('./src/config');

const kommo = axios.create({
  baseURL: config.kommo.baseUrl,
  headers: {
    Authorization: 'Bearer ' + config.kommo.token,
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

async function main() {
  // 1. Получаем список всех типов задач
  console.log('=== Kommo Task Types ===');
  try {
    const typesRes = await kommo.get('/api/v4/tasks/types');
    const types = (typesRes.data && typesRes.data._embedded && typesRes.data._embedded.task_types) || [];
    console.log('Total task types:', types.length);
    types.forEach(function(tt, i) {
      console.log('  Type ' + i + ': id=' + tt.id + ', name="' + tt.name + '", color="' + (tt.color || '') + '", icon_id=' + (tt.icon_id || ''));
    });
    console.log('\nFull types JSON:');
    console.log(JSON.stringify(types, null, 2));
  } catch (e) {
    console.error('Error fetching task types:', e.response ? e.response.status + ' ' + JSON.stringify(e.response.data) : e.message);
  }

  // 2. Задачи сделки 18446931
  console.log('\n=== Tasks for deal #18446931 ===');
  try {
    const res = await kommo.get('/api/v4/tasks', {
      params: {
        'filter[entity_type]': 'leads',
        'filter[entity_id][]': 18446931,
        limit: 50,
      }
    });
    var tasks = (res.data._embedded && res.data._embedded.tasks) || [];
    console.log('Tasks found:', tasks.length);
    tasks.forEach(function(t, i) {
      console.log('\n--- Task ' + i + ' ---');
      console.log('  id:', t.id);
      console.log('  task_type_id:', t.task_type_id);
      console.log('  text:', JSON.stringify(t.text));
      console.log('  is_completed:', t.is_completed);
      console.log('  complete_till:', t.complete_till, '(' + new Date(t.complete_till * 1000).toISOString() + ')');
      console.log('  created_at:', t.created_at, '(' + new Date(t.created_at * 1000).toISOString() + ')');
      console.log('  responsible_user_id:', t.responsible_user_id);
      console.log('  Full JSON:');
      console.log(JSON.stringify(t, null, 2));
    });
  } catch (e) {
    console.error('Error:', e.response ? e.response.status + ' ' + JSON.stringify(e.response.data) : e.message);
  }
}

main();
