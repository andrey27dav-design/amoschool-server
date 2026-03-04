/**
 * Находит сделки в Kommo воронке "Deferret" стадии "Closed - lost",
 * сопоставляет с AMO-кэшем по названию и добавляет пары в migration_index.json
 */
const https = require('https');
const fs = require('fs');

const KOMMO_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImFiNmFlNzdiNjI4NWQ1ZmYwNmM0MmY4ZjQ2NjRhYmU0NGNkNDgzMWJlZTRhNDM2MzI0NjEyZGY1N2FjZGNkYzUwNjRlYTFjNDk2ZDQxN2E3In0.eyJhdWQiOiI3MTU3NTZiYS00MTk3LTQ5MWItYTQ2MS0wOTlkMDJkNTdlMTYiLCJqdGkiOiJhYjZhZTc3YjYyODVkNWZmMDZjNDJmOGY0NjY0YWJlNDRjZDQ4MzFiZWU0YTQzNjMyNDYxMmRmNTdhY2RjZGM1MDY0ZWExYzQ5NmQ0MTdhNyIsImlhdCI6MTc3MTQ4NjExNiwibmJmIjoxNzcxNDg2MTE2LCJleHAiOjE4MzAyOTc2MDAsInN1YiI6IjEyNzM5Nzk1IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjM0MTkyNTIzLCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJjcm0iLCJmaWxlcyIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJwdXNoX25vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiM2ZmYzRmYjItOTRiNy00ZWFhLTkzY2QtMmU1YzU4ZWQwMjlmIiwiYXBpX2RvbWFpbiI6ImFwaS1nLmtvbW1vLmNvbSJ9.J-fe71D0ODNz_OvlZIJSP0dZ-DSN9qUUtCjDxmcm76l-X2oiKTrlQht6gPuPygEgbdezr-9DD5mqxdYAnVNi92eahqLTWAiVS9UmieiFc2duGnYwlKO3zJ44zd0hV_D29HTPawhNAjm3bur19FKYSV7teJKUCPdSVOkp_ew7I2TmEszKqvGTisWubplGz9wUROBefUzjCKGgMSXXhqZm27FHKE6RhAUTSagys6o09dxxh2gGktEXJ5BpoQ2Q3GX3y-I8YDPHs-R6bbxLz6SUol3s5fzobM9KNY1NgbNZ1297v43Wp2PUTLfgDY7fDX4d7zFjGFYlYjn-2XOvdFiTQA';
const KOMMO_HOST = 'api-g.kommo.com';
const INDEX_PATH = '/var/www/amoschool/backend/backups/migration_index.json';
const CACHE_PATH = '/var/www/amoschool/backend/backups/amo_data_cache.json';

function apiGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: KOMMO_HOST,
      path: path,
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + KOMMO_TOKEN }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON parse error: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  // 1. Get all pipelines
  console.log('Загружаю воронки Kommo...');
  const pipelines = await apiGet('/api/v4/leads/pipelines?limit=50');
  const pipelineList = pipelines._embedded?.pipelines || [];
  
  const deferret = pipelineList.find(p => p.name.toLowerCase().includes('deferret'));
  if (!deferret) {
    console.log('Воронки: ' + pipelineList.map(p => '"' + p.name + '" id=' + p.id).join(', '));
    throw new Error('Воронка Deferret не найдена!');
  }
  console.log('Найдена воронка: "' + deferret.name + '" id=' + deferret.id);

  // 2. Find "Closed - lost" stage
  const statuses = deferret.statuses || deferret._embedded?.statuses || [];
  const closedLost = statuses.find(s => s.name.toLowerCase().includes('closed') || s.name.toLowerCase().includes('lost') || s.id === 143);
  const stageLabel = statuses.map(s => '"' + s.name + '" id=' + s.id).join(', ');
  console.log('Стадии в воронке: ' + stageLabel);
  
  // 3. Get ALL leads from Deferret pipeline (paginate through all pages)
  console.log('Загружаю сделки из воронки Deferret...');
  let allKommoLeads = [];
  let page = 1;
  while (true) {
    const url = '/api/v4/leads?filter[pipeline_id]=' + deferret.id + '&limit=250&page=' + page + '&with=contacts';
    const resp = await apiGet(url);
    const batch = resp._embedded?.leads || [];
    allKommoLeads = allKommoLeads.concat(batch);
    if (batch.length < 250) break;
    page++;
  }
  console.log('Всего сделок в воронке Deferret: ' + allKommoLeads.length);

  // Filter to closed/lost (status_id=143 is lost, or name match)
  const lostStatusIds = new Set();
  statuses.forEach(s => {
    if (s.name.toLowerCase().includes('los') || s.name.toLowerCase().includes('clos') || s.id === 143) {
      lostStatusIds.add(s.id);
    }
  });
  // Also always include 143 (Kommo system "Closed - lost")
  lostStatusIds.add(143);
  console.log('Status IDs считающихся "closed/lost": ' + [...lostStatusIds].join(', '));

  const lostLeads = allKommoLeads.filter(l => lostStatusIds.has(l.status_id));
  console.log('Сделки в Closed-lost: ' + lostLeads.length);
  if (lostLeads.length === 0) {
    console.log('Все сделки воронки:', allKommoLeads.map(l => l.name + ' (status=' + l.status_id + ')').join('\n'));
  }

  // 4. Load AMO cache + migration index
  const cache = JSON.parse(fs.readFileSync(CACHE_PATH));
  const idx   = JSON.parse(fs.readFileSync(INDEX_PATH));
  const amoLeads = cache.leads || [];
  
  // Already migrated AMO IDs
  const alreadyMigrated = new Set(Object.keys(idx.leads || {}));

  // Build name -> amo lead map (only NOT yet in index)
  const amoByName = {};
  amoLeads.forEach(l => {
    const norm = (l.name || '').trim().toLowerCase();
    if (norm && !alreadyMigrated.has(String(l.id))) {
      if (!amoByName[norm]) amoByName[norm] = [];
      amoByName[norm].push(l);
    }
  });

  // 5. Match Kommo Deferret leads → AMO leads by name
  const matched = [];
  const unmatched = [];

  lostLeads.forEach(kLead => {
    const norm = (kLead.name || '').trim().toLowerCase();
    const candidates = amoByName[norm];
    if (candidates && candidates.length === 1) {
      matched.push({ amoId: candidates[0].id, kommoId: kLead.id, name: kLead.name });
    } else if (candidates && candidates.length > 1) {
      unmatched.push({ kommoId: kLead.id, name: kLead.name, reason: 'multiple AMO matches: ' + candidates.map(c=>c.id).join(',') });
    } else {
      unmatched.push({ kommoId: kLead.id, name: kLead.name, reason: 'no AMO match in cache' });
    }
  });

  console.log('\n=== MATCHED (' + matched.length + ') ===');
  matched.forEach(m => console.log('  AMO ' + m.amoId + ' -> Kommo ' + m.kommoId + '  "' + m.name + '"'));
  
  console.log('\n=== НЕ СОПОСТАВЛЕНЫ (' + unmatched.length + ') ===');
  unmatched.forEach(u => console.log('  Kommo ' + u.kommoId + '  "' + u.name + '" | ' + u.reason));

  // 6. Add matched pairs to migration_index.json
  if (matched.length > 0) {
    if (!idx.leads) idx.leads = {};
    matched.forEach(m => {
      idx.leads[String(m.amoId)] = m.kommoId;
    });
    fs.writeFileSync(INDEX_PATH, JSON.stringify(idx, null, 2));
    console.log('\n✅ Добавлено ' + matched.length + ' пар в migration_index.json — дублей не будет');
  } else {
    console.log('\n⚠️  Ни одной пары не добавлено');
  }
}

main().catch(e => { console.error('ОШИБКА:', e.message); process.exit(1); });
