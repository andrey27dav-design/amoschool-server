'use strict';
// create_prodlenie_task.js — создаёт задачу ПРОДЛЕНИЕ 22.03.2026 в Kommo
// AMO task 36841579, contact 28690495, lead 28405705 → Kommo lead 18330165
const https = require('https');
const fs = require('fs-extra');
const { AMO_TOKEN, AMO_HOST, KOMMO_TOKEN, KOMMO_HOST, KOMMO_USER_ID } = require('./creds');

function req(hostname, path, method, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = https.request({
      hostname, path, method,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
    }, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch(e) { resolve({ status: res.statusCode, body: { _raw: raw.substring(0, 300) } }); }
      });
    });
    req.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

// Перегружаем функцию правильно
function apiReq(hostname, path, method, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = { hostname, path, method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } };
    const r = https.request(options, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch(e) { resolve({ status: res.statusCode, body: { _raw: raw.substring(0, 300) } }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function sleep(ms) { return new Promise(re => setTimeout(re, ms)); }

async function main() {
  const AMO_CONTACT_ID = 28690495; // Зинченко Юлия
  const KOMMO_LEAD_ID  = 18330165; // привязка к сделке как fallback

  // 1. Ищем Kommo ID контакта в migration_index
  const idx = fs.readJsonSync('./backups/migration_index.json');
  const contacts = idx.contacts || {};
  const kommoContactId = contacts[AMO_CONTACT_ID] || contacts[String(AMO_CONTACT_ID)];
  console.log(`AMO contact ${AMO_CONTACT_ID} → Kommo contact: ${kommoContactId || 'NOT IN INDEX'}`);

  // 2. Получаем детали задачи из AMO
  const taskRes = await apiReq(AMO_HOST, '/api/v4/tasks/36841579', 'GET', AMO_TOKEN);
  await sleep(300);
  const amoTask = taskRes.body;
  console.log('AMO task:', JSON.stringify({ id: amoTask.id, text: amoTask.text, complete_till: amoTask.complete_till, task_type_id: amoTask.task_type_id, entity_type: amoTask.entity_type }));

  // 3. Создаём задачу в Kommo
  // Привязываем к контакту если нашли, иначе к сделке
  const entityId   = kommoContactId ? Number(kommoContactId) : KOMMO_LEAD_ID;
  const entityType = kommoContactId ? 'contacts' : 'leads';
  console.log(`Создаём задачу: entity_type=${entityType}, entity_id=${entityId}`);

  // Проверяем — нет ли уже такой задачи в Kommo
  const existRes = await apiReq(KOMMO_HOST, `/api/v4/tasks?filter[entity_id]=${entityId}&filter[entity_type]=${entityType}&limit=50`, 'GET', KOMMO_TOKEN);
  await sleep(300);
  const existTasks = existRes.body?._embedded?.tasks || [];
  const completeTill = amoTask.complete_till || Math.floor(new Date('2026-03-22').getTime() / 1000);
  const alreadyExists = existTasks.some(t => String(t.complete_till) === String(completeTill));
  if (alreadyExists) {
    console.log('✅ Задача уже существует в Kommo — создавать не нужно');
    return;
  }

  const payload = [{
    text: (amoTask.text || '').trim() || 'ПРОДЛЕНИЕ',
    complete_till: completeTill,
    task_type_id: 1,
    entity_id: entityId,
    entity_type: entityType,
    responsible_user_id: KOMMO_USER_ID,
    is_completed: false,
  }];

  const createRes = await apiReq(KOMMO_HOST, '/api/v4/tasks', 'POST', KOMMO_TOKEN, payload);
  await sleep(300);
  if (createRes.status === 200) {
    const created = createRes.body?._embedded?.tasks || [];
    console.log(`✅ Задача создана: Kommo task #${created[0]?.id}, entity_type=${entityType}, entity_id=${entityId}`);
  } else {
    console.error(`❌ Ошибка: HTTP ${createRes.status}`, JSON.stringify(createRes.body).substring(0, 300));
  }
}

main().catch(console.error);
