// check-kommo-task-types-v2.js — ищем названия типов задач в Kommo
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
  // 1. Account info с task_types (как сработало в AMO)
  console.log('=== Kommo Account with task_types ===');
  try {
    var res = await kommo.get('/api/v4/account', {
      params: { 'with': 'task_types' }
    });
    if (res.data._embedded && res.data._embedded.task_types) {
      console.log('Task types from _embedded:');
      res.data._embedded.task_types.forEach(function(tt) {
        console.log('  id=' + tt.id + ', name="' + tt.name + '", color="' + (tt.color || '') + '", icon_id=' + (tt.icon_id || ''));
      });
    }
    if (res.data.task_types) {
      console.log('Task types from root:');
      console.log(JSON.stringify(res.data.task_types, null, 2));
    }
    // Показать все ключи ответа
    console.log('\nAccount keys:', Object.keys(res.data));
    if (res.data._embedded) {
      console.log('Embedded keys:', Object.keys(res.data._embedded));
    }
  } catch (e) {
    console.log('Error:', e.response ? e.response.status + ' ' + JSON.stringify(e.response.data).substring(0, 300) : e.message);
  }

  // 2. Задачи сделки с параметром with
  console.log('\n=== Tasks for deal #18446931 with task_type ===');
  try {
    var res2 = await kommo.get('/api/v4/tasks', {
      params: {
        'filter[entity_type]': 'leads',
        'filter[entity_id][]': 18446931,
        limit: 50,
        'with': 'task_type'
      }
    });
    var tasks = (res2.data._embedded && res2.data._embedded.tasks) || [];
    console.log('Tasks found:', tasks.length);
    tasks.forEach(function(t, i) {
      console.log('\n--- Task ' + i + ' (id=' + t.id + ') ---');
      console.log('FULL JSON:');
      console.log(JSON.stringify(t, null, 2));
    });
  } catch (e) {
    console.log('Error:', e.response ? e.response.status + ' ' + JSON.stringify(e.response.data).substring(0, 300) : e.message);
  }

  // 3. Попробуем GET одну задачу напрямую
  console.log('\n=== Single task GET ===');
  try {
    var res3 = await kommo.get('/api/v4/tasks/2517583');
    console.log(JSON.stringify(res3.data, null, 2));
  } catch (e) {
    console.log('Error:', e.response ? e.response.status : e.message);
  }
}

main();
