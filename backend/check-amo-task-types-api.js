// check-amo-task-types-api.js — запрос типов задач из AMO API
const axios = require('axios');
const config = require('./src/config');

const amo = axios.create({
  baseURL: config.amo.baseUrl,
  headers: {
    Authorization: 'Bearer ' + config.amo.token,
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

async function main() {
  // 1. Пробуем получить типы задач из AMO
  console.log('=== AMO Task Types (GET /api/v4/tasks) ===');
  console.log('AMO baseURL:', config.amo.baseUrl);

  // AMO не имеет /api/v4/tasks/types, но можем попробовать
  try {
    var res = await amo.get('/api/v4/leads/tasks/types');
    console.log('leads/tasks/types:', JSON.stringify(res.data, null, 2));
  } catch (e) {
    console.log('/api/v4/leads/tasks/types:', e.response ? e.response.status : e.message);
  }

  try {
    var res2 = await amo.get('/api/v4/tasks/types');
    console.log('/api/v4/tasks/types:', JSON.stringify(res2.data, null, 2));
  } catch (e) {
    console.log('/api/v4/tasks/types:', e.response ? e.response.status : e.message);
  }

  // 2. Попробуем получить одну задачу каждого типа и посмотреть _embedded
  console.log('\n=== Trying single task with embed ===');
  var typeIds = [1, 2, 2377729, 2377732, 2377735, 2377738, 2377744, 2377747, 2377750, 2378121, 2378124, 2518729];

  // Получаем одну задачу с каждым типом
  try {
    var res3 = await amo.get('/api/v4/tasks', {
      params: { limit: 1, 'with': 'task_type' }
    });
    console.log('Task with embed task_type:');
    var t = res3.data._embedded.tasks[0];
    console.log(JSON.stringify(t, null, 2));
    console.log('_embedded:', JSON.stringify(res3.data._embedded, null, 2).substring(0, 500));
  } catch (e) {
    console.log('Error with embed:', e.response ? e.response.status + ' ' + JSON.stringify(e.response.data).substring(0, 200) : e.message);
  }

  // 3. Пробуем account info с task_types
  console.log('\n=== Account info with task_types ===');
  try {
    var res4 = await amo.get('/api/v4/account', {
      params: { 'with': 'task_types' }
    });
    if (res4.data._embedded && res4.data._embedded.task_types) {
      console.log('Task types from account:');
      res4.data._embedded.task_types.forEach(function(tt) {
        console.log('  id=' + tt.id + ', name="' + tt.name + '", color="' + (tt.color || '') + '"');
      });
    } else if (res4.data.task_types) {
      console.log('Task types (root):', JSON.stringify(res4.data.task_types, null, 2));
    } else {
      // Show all keys
      console.log('Account keys:', Object.keys(res4.data));
      if (res4.data._embedded) {
        console.log('Embedded keys:', Object.keys(res4.data._embedded));
      }
    }
  } catch (e) {
    console.log('Error:', e.response ? e.response.status : e.message);
  }
}

main();
