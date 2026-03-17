// check-kommo-tasks-v2.js — используем настроенный kommoClient из проекта
const path = require('path');

// Загружаем .env
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { kommoClient } = require('./src/services/kommoApi');

async function main() {
  console.log('=== 1. Getting 3 tasks from Kommo ===');
  try {
    const res = await kommoClient.get('/api/v4/tasks', { params: { limit: 3 } });
    const tasks = res.data._embedded && res.data._embedded.tasks || [];
    console.log('Tasks found:', tasks.length);
    
    tasks.forEach((t, i) => {
      console.log('\nKommo Task #' + i + ':', JSON.stringify(t, null, 2));
    });
    
    // All keys
    const keys = new Set();
    tasks.forEach(t => Object.keys(t).forEach(k => keys.add(k)));
    console.log('\nAll Kommo task keys:', [...keys].sort().join(', '));
    console.log('Has task_type_id:', tasks.some(t => t.task_type_id !== undefined));
  } catch (e) {
    console.error('Error getting tasks:', e.response ? e.response.status + ' ' + JSON.stringify(e.response.data) : e.message);
  }
}

main();
