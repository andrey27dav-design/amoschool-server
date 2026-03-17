// check-deal-tasks.js — запрос задач по сделке #18421423 из Kommo
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
  const LEAD_ID = 18446931;

  console.log('=== Tasks for Kommo lead #' + LEAD_ID + ' ===');
  console.log('BaseURL:', config.kommo.baseUrl);

  try {
    const res = await kommo.get('/api/v4/tasks', {
      params: {
        'filter[entity_type]': 'leads',
        'filter[entity_id][]': LEAD_ID,
        limit: 50
      }
    });

    const tasks = (res.data._embedded && res.data._embedded.tasks) || [];
    console.log('Total tasks found:', tasks.length);

    tasks.forEach(function(t, i) {
      console.log('\n--- Task #' + i + ' ---');
      console.log(JSON.stringify(t, null, 2));
    });

    // Summary
    if (tasks.length > 0) {
      console.log('\n=== SUMMARY ===');
      var keys = {};
      tasks.forEach(function(t) {
        Object.keys(t).forEach(function(k) { keys[k] = true; });
      });
      console.log('All keys:', Object.keys(keys).sort().join(', '));
      console.log('Has task_type_id:', tasks.some(function(t) { return t.task_type_id !== undefined; }));
      tasks.forEach(function(t, i) {
        console.log('  Task ' + i + ': task_type_id=' + t.task_type_id +
          ', text="' + (t.text || '').substring(0, 80) + '"' +
          ', is_completed=' + t.is_completed);
      });
    }
  } catch (e) {
    console.error('Error:', e.response ? e.response.status + ' ' + JSON.stringify(e.response.data) : e.message);
  }
}

main();
