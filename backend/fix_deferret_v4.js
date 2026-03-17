// fix_deferret_v4.js — запускать из /var/www/amoschool/backend
const fs     = require('fs');
const axios  = require('axios');
const config = require('./src/config');

const INDEX_PATH = './backups/migration_index.json';
const CACHE_PATH = './backups/amo_data_cache.json';

const client = axios.create({
  baseURL: config.kommo.baseUrl,
  headers: { Authorization: 'Bearer ' + config.kommo.token },
  timeout: 30000,
});

async function get(path) {
  const r = await client.get(path);
  return r.data;
}

async function main() {
  // 1. Pipelines
  console.log('Загружаю воронки...');
  const pr = await get('/api/v4/leads/pipelines?limit=100');
  const pipes = pr._embedded?.pipelines || [];
  pipes.forEach(p => console.log('  "' + p.name + '" id=' + p.id));

  const deferret = pipes.find(p => p.name.toLowerCase().includes('defer'));
  if (!deferret) throw new Error('Воронка Deferret не найдена!');
  console.log('\nВоронка: "' + deferret.name + '" id=' + deferret.id);

  const statuses = deferret._embedded?.statuses || [];
  console.log('Стадии: ' + statuses.map(s => '"' + s.name + '" id=' + s.id).join(', '));

  const lostIds = new Set([143]);
  statuses.forEach(s => { if (/los|clos/i.test(s.name)) lostIds.add(s.id); });
  console.log('ID потерь: ' + [...lostIds].join(', '));

  // 2. Load ALL leads from Deferred pipeline (all stages)
  console.log('\nЗагружаю ВСЕ сделки из Deferred (все стадии)...');
  let allLeads = [];
  let page = 1;
  while (true) {
    let batch = [];
    try {
      const r = await get('/api/v4/leads?filter[pipeline_id]=' + deferret.id + '&limit=250&page=' + page);
      batch = r._embedded?.leads || [];
    } catch(e) {
      if (e.response?.status === 204) { console.log('  стр.' + page + ': пусто'); break; }
      throw e;
    }
    allLeads = allLeads.concat(batch);
    console.log('  стр.' + page + ': ' + batch.length + ' сделок');
    if (batch.length < 250) break;
    page++;
    await new Promise(r => setTimeout(r, 300));
  }
  console.log('Всего в воронке: ' + allLeads.length);

  // Show breakdown by stage
  const byStatus = {};
  allLeads.forEach(l => { byStatus[l.status_id] = (byStatus[l.status_id]||0)+1; });
  Object.entries(byStatus).forEach(([sid, cnt]) => {
    const sName = statuses.find(s=>s.id==sid)?.name || ('id='+sid);
    console.log('  стадия "' + sName + '" (' + sid + '): ' + cnt + ' сделок');
  });

  // Use ALL leads from this pipeline as candidates (user may have moved them to any stage)
  const lostLeads = allLeads;
  console.log('Кандидатов для сопоставления: ' + lostLeads.length);

  // 3. Match with AMO cache
  const cache = JSON.parse(fs.readFileSync(CACHE_PATH));
  const idx   = JSON.parse(fs.readFileSync(INDEX_PATH));
  const already = new Set(Object.keys(idx.leads || {}));

  const amoByName = {};
  (cache.leads || []).forEach(l => {
    const n = (l.name || '').trim().toLowerCase();
    if (!already.has(String(l.id))) {
      if (!amoByName[n]) amoByName[n] = [];
      amoByName[n].push(l);
    }
  });

  const matched = [], unmatched = [];
  lostLeads.forEach(kl => {
    const n = (kl.name || '').trim().toLowerCase();
    const hits = amoByName[n];
    if (hits && hits.length === 1) {
      matched.push({ amoId: hits[0].id, kommoId: kl.id, name: kl.name });
    } else {
      unmatched.push({ kommoId: kl.id, name: kl.name, reason: hits ? 'несколько AMO: ' + hits.map(h=>h.id).join(',') : 'нет в кэше AMO' });
    }
  });

  console.log('\n=== MATCHED (' + matched.length + ') ===');
  matched.forEach(m => console.log('  AMO ' + m.amoId + ' -> Kommo ' + m.kommoId + '  "' + m.name + '"'));
  console.log('\n=== НЕ СОПОСТАВЛЕНЫ (' + unmatched.length + ') ===');
  unmatched.forEach(u => console.log('  Kommo ' + u.kommoId + '  "' + u.name + '"  | ' + u.reason));

  // 4. Write matched pairs to index
  if (matched.length > 0) {
    if (!idx.leads) idx.leads = {};
    matched.forEach(m => { idx.leads[String(m.amoId)] = m.kommoId; });
    fs.writeFileSync(INDEX_PATH, JSON.stringify(idx, null, 2));
    console.log('\n✅ Добавлено ' + matched.length + ' пар в migration_index.json');
    console.log('Итого leads в индексе теперь: ' + Object.keys(idx.leads).length);
  } else {
    console.log('\n⚠️  Нет подходящих пар для добавления');
  }
}

main().catch(e => { console.error('ОШИБКА:', e.message); if (e.response) console.error('Response:', JSON.stringify(e.response.data).slice(0,300)); });
