'use strict';
// transfer_3leads.js
// Забирает ВСЕ задачи и комментарии из AMO для 3 сделок напрямую через API
// и создаёт недостающие в Kommo (с проверкой дублей по реальному контенту Kommo)

const https = require('https');
const { AMO_TOKEN, AMO_HOST, KOMMO_TOKEN, KOMMO_HOST, KOMMO_USER_ID } = require('./creds');

const SKIP_NOTE_TYPES = new Set([10, 11, 'amomail_message', 'extended_service_message', 'lead_auto_created']);

// AMO → Kommo mapping
const LEADS = [
  { amoId: 25630433, kommoId: 18330163 },
  { amoId: 28405705, kommoId: 18330165 },
  { amoId: 28071467, kommoId: 18330167 },
];

function request(hostname, path, method, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname,
      path,
      method,
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(options, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        let parsed = null;
        try { parsed = raw.trim() ? JSON.parse(raw) : {}; } catch(e) { parsed = { _raw: raw.substring(0, 300) }; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Постраничная выборка из AMO
async function amoGetAll(path) {
  let results = [];
  let page = 1;
  while (true) {
    const sep = path.includes('?') ? '&' : '?';
    const r = await request(AMO_HOST, path + sep + 'limit=250&page=' + page, 'GET', AMO_TOKEN);
    await sleep(300);
    if (r.status === 204 || r.status === 404) break;
    if (r.status !== 200) { console.error('AMO error', r.status, JSON.stringify(r.body).substring(0, 200)); break; }
    const items = r.body?._embedded;
    if (!items) break;
    const arr = items.tasks || items.notes || items.leads || [];
    if (!arr.length) break;
    results = results.concat(arr);
    if (arr.length < 250) break;
    page++;
  }
  return results;
}

// Постраничная выборка из Kommo
async function kommoGetAll(path) {
  let results = [];
  let page = 1;
  while (true) {
    const sep = path.includes('?') ? '&' : '?';
    const r = await request(KOMMO_HOST, path + sep + 'limit=250&page=' + page, 'GET', KOMMO_TOKEN);
    await sleep(300);
    if (r.status === 204 || r.status === 404) break;
    if (r.status !== 200) { console.error('Kommo GET error', r.status, path); break; }
    const items = r.body?._embedded;
    if (!items) break;
    const arr = items.tasks || items.notes || [];
    if (!arr.length) break;
    results = results.concat(arr);
    if (arr.length < 250) break;
    page++;
  }
  return results;
}

function sanitizeNoteParams(note) {
  const type = note.note_type;
  const params = note.params || {};

  // Для типов с текстом — возвращаем как есть
  if (type === 'common') return { note_type: 'common', params: { text: params.text || '' } };

  // call_in / call_out
  if (type === 'call_in' || type === 'call_out') {
    return {
      note_type: type,
      params: {
        uniq: params.uniq || '',
        duration: params.duration || 0,
        source: params.source || '',
        phone: params.phone || '',
        call_result: params.call_result || '',
        call_status: params.call_status || 0,
        ...(params.link ? { link: params.link } : {}),
      },
    };
  }

  // Для остальных типов пробуем передать params как есть, но с fallback на common
  return { note_type: 'common', params: { text: '[' + type + '] ' + (params.text || JSON.stringify(params).substring(0, 200)) } };
}

// Ключ дубля для задачи: дедупликация по дате дедлайна — достаточно уникально per lead
// (миграция-сервис добавлял дату в начало текста, поэтому text-сравнение даёт ложные дубли)
function taskKey(t) { return String(t.complete_till || 0); }

// Ключ дубля для заметки (type + text)
function noteKey(n) {
  const p = n.params || {};
  const text = p.text || p.call_result || JSON.stringify(p).substring(0, 100);
  return (n.note_type || '') + '|' + text.substring(0, 100).trim();
}

async function processLead(amoId, kommoId) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`AMO #${amoId} → Kommo #${kommoId}`);
  console.log('='.repeat(60));

  // ── 1. Получаем ВСЕ задачи из AMO
  const amoTasks = await amoGetAll(`/api/v4/tasks?filter[entity_id][]=${amoId}&filter[entity_type]=leads`);
  console.log(`AMO tasks total: ${amoTasks.length}`);

  // ── 2. Получаем ВСЕ заметки из AMO
  const amoNotes = await amoGetAll(`/api/v4/leads/${amoId}/notes`);
  const filteredNotes = amoNotes.filter(n => !SKIP_NOTE_TYPES.has(n.note_type));
  console.log(`AMO notes total: ${amoNotes.length}, after filter: ${filteredNotes.length}`);

  // ── 3. Получаем существующие задачи из Kommo
  const kommoTasks = await kommoGetAll(`/api/v4/tasks?filter[entity_id]=${kommoId}&filter[entity_type]=leads`);
  const kommoTaskKeys = new Set(kommoTasks.map(taskKey));
  console.log(`Kommo existing tasks: ${kommoTasks.length}`);

  // ── 4. Получаем существующие заметки из Kommo
  const kommoNotes = await kommoGetAll(`/api/v4/leads/${kommoId}/notes`);
  const kommoNoteKeys = new Set(kommoNotes.map(noteKey));
  console.log(`Kommo existing notes: ${kommoNotes.length}`);

  // ── 5. Создаём недостающие задачи
  const tasksToCreate = amoTasks.filter(t => !kommoTaskKeys.has(taskKey(t)));
  console.log(`Tasks to create: ${tasksToCreate.length}`);

  if (tasksToCreate.length > 0) {
    const payload = tasksToCreate.map(t => ({
      text: (t.text || '').trim() || '—',   // Kommo требует непустой текст
      complete_till: t.complete_till || Math.floor(Date.now() / 1000) + 86400,
      task_type_id: 1,                        // Kommo поддерживает только 1 (звонок) и 2 (встреча)
      entity_id: kommoId,
      entity_type: 'leads',
      responsible_user_id: KOMMO_USER_ID,
      is_completed: t.is_completed || false,
    }));

    const r = await request(KOMMO_HOST, '/api/v4/tasks', 'POST', KOMMO_TOKEN, payload);
    await sleep(500);
    if (r.status === 200) {
      const created = r.body?._embedded?.tasks || [];
      console.log(`  ✅ Создано задач: ${created.length}`);
      tasksToCreate.forEach((t, i) => {
        const dt = t.complete_till ? new Date(t.complete_till * 1000).toISOString().slice(0, 10) : 'nodate';
        console.log(`     AMO task ${t.id} | due:${dt} | "${(t.text||'').substring(0,50)}" → Kommo #${created[i]?.id || '?'}`);
      });
    } else {
      console.error(`  ❌ Ошибка создания задач: HTTP ${r.status}`, JSON.stringify(r.body).substring(0, 300));
    }
  }

  // ── 6. Создаём недостающие заметки
  const notesToCreate = filteredNotes.filter(n => !kommoNoteKeys.has(noteKey(n)));
  console.log(`Notes to create: ${notesToCreate.length}`);

  // Пакетами по 50
  const BATCH = 50;
  for (let i = 0; i < notesToCreate.length; i += BATCH) {
    const chunk = notesToCreate.slice(i, i + BATCH);
    const payload = chunk.map(n => {
      const s = sanitizeNoteParams(n);
      return {
        entity_id: kommoId,
        note_type: s.note_type,
        params: s.params,
        created_by: KOMMO_USER_ID,
      };
    });

    const r = await request(KOMMO_HOST, '/api/v4/leads/notes', 'POST', KOMMO_TOKEN, payload);
    await sleep(500);
    if (r.status === 200) {
      const created = r.body?._embedded?.notes || [];
      console.log(`  ✅ Создано заметок (chunk ${Math.floor(i/BATCH)+1}): ${created.length}`);
    } else {
      console.error(`  ❌ Ошибка создания заметок: HTTP ${r.status}`, JSON.stringify(r.body).substring(0, 300));
    }
  }
}

async function main() {
  console.log('=== ПЕРЕНОС задач и заметок для 3 сделок (из AMO live API) ===');
  console.log('Дата:', new Date().toISOString());

  for (const { amoId, kommoId } of LEADS) {
    await processLead(amoId, kommoId);
    await sleep(1000);
  }

  console.log('\n✅ Готово!');
}

main().catch(console.error);
