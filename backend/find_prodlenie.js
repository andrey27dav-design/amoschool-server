'use strict';
// find_prodlenie.js — ищет задачу ПРОДЛЕНИЕ / активные задачи по контакту сделки 28405705
const https = require('https');
const { AMO_TOKEN, AMO_HOST, KOMMO_TOKEN, KOMMO_HOST, KOMMO_USER_ID } = require('./creds');

function get(hostname, path, token) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'GET', headers: { Authorization: 'Bearer ' + token } }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: {} }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  // 1. Получаем сделку из AMO — узнаём ID контактa
  const leadRes = await get(AMO_HOST, '/api/v4/leads/28405705?with=contacts', AMO_TOKEN);
  await sleep(300);
  const contacts = leadRes.body?._embedded?.contacts || [];
  console.log('Contacts for AMO lead 28405705:', contacts.map(c => `${c.id} (${c.is_main ? 'main' : 'linked'})`));

  // 2. Для каждого контакта ищем ВСЕ задачи
  for (const c of contacts) {
    console.log(`\n--- Tasks for contact AMO#${c.id} ---`);
    const r = await get(AMO_HOST, `/api/v4/tasks?filter[entity_id][]=${c.id}&filter[entity_type]=contacts&limit=50`, AMO_TOKEN);
    await sleep(300);
    const tasks = r.body?._embedded?.tasks || [];
    console.log(`Total: ${tasks.length}`);
    tasks.forEach(t => {
      const dt = t.complete_till ? new Date(t.complete_till * 1000).toISOString().slice(0, 10) : 'nodate';
      console.log(`  Task ${t.id} | due:${dt} | done:${t.is_completed} | "${(t.text||'').substring(0,60)}"`);
    });
  }

  // 3. Также ищем все задачи из AMO по сделке без фильтра entity_type
  console.log('\n--- All tasks for AMO lead 28405705 (no entity_type filter) ---');
  const r2 = await get(AMO_HOST, '/api/v4/tasks?filter[entity_id][]=28405705&limit=50', AMO_TOKEN);
  await sleep(300);
  const allTasks = r2.body?._embedded?.tasks || [];
  console.log('Total:', allTasks.length);
  allTasks.forEach(t => {
    const dt = t.complete_till ? new Date(t.complete_till * 1000).toISOString().slice(0, 10) : 'nodate';
    console.log(`  Task ${t.id} | entity_type:${t.entity_type} | due:${dt} | done:${t.is_completed} | "${(t.text||'').substring(0,60)}"`);
  });
}

main().catch(console.error);
