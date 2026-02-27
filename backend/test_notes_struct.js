const axios = require('axios');
const cfg = require('./src/config');

const c = axios.create({
  baseURL: cfg.kommo.baseUrl,
  headers: {
    'Authorization': 'Bearer ' + cfg.kommo.token,
    'Content-Type': 'application/json'
  },
  timeout: 12000
});

async function main() {
  console.log('Testing POST notes...');
  try {
    const r = await c.post('/api/v4/leads/notes', [
      { entity_id: 18219421, note_type: 'common', params: { text: 'struct_test_' + Date.now() } }
    ]);
    console.log('status:', r.status);
    console.log('data keys:', Object.keys(r.data));
    const em = r.data._embedded;
    console.log('_embedded keys:', em ? Object.keys(em) : 'NONE');
    if (em && em.notes) {
      console.log('notes count:', em.notes.length);
      console.log('first note id:', em.notes[0] && em.notes[0].id);
    }
  } catch(e) {
    const d = e.response;
    console.error('ERROR:', d ? d.status : e.message);
    if (d) console.error('body:', JSON.stringify(d.data).substring(0, 300));
  }

  console.log('\nTesting POST tasks...');
  try {
    const r = await c.post('/api/v4/tasks', [
      { task_type_id: 1, text: 'struct_test_' + Date.now(), complete_till: Math.floor(Date.now()/1000) + 86400, entity_id: 18219421, entity_type: 'leads' }
    ]);
    console.log('status:', r.status);
    const em = r.data._embedded;
    console.log('_embedded keys:', em ? Object.keys(em) : 'NONE');
    if (em && em.tasks) {
      console.log('tasks count:', em.tasks.length);
      console.log('first task id:', em.tasks[0] && em.tasks[0].id);
    }
  } catch(e) {
    const d = e.response;
    console.error('ERROR:', d ? d.status : e.message);
    if (d) console.error('body:', JSON.stringify(d.data).substring(0, 300));
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
