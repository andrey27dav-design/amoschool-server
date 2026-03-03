/**
 * run_migration_test.js
 * Оркестрирует тест миграции через API бэкенда (порт 3008):
 * 1. Ждёт завершения текущего fetch (если есть)
 * 2. Запускает fetch для pipeline 9408314 (ПРОГРЕВ маркетинг МШ)
 * 3. Ждёт загрузки данных
 * 4. Получает текущий stage mapping
 * 5. Запускает transfer-deals для сделки 31652221
 * 6. Выводит результат
 */
require('dotenv').config();
const axios = require('./node_modules/axios');

const API = 'http://localhost:3008';
const LEAD_ID = 31652221;
const PIPELINE_ID = 9408314;

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function pollFetchStatus(maxWaitMs = 300000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const r = await axios.get(API + '/api/amo/fetch-status', { timeout: 10000 });
      const s = r.data;
      if (s.status === 'done') {
        console.log('Fetch done. Counts:', JSON.stringify(s.progress?.loaded || {}));
        return true;
      }
      if (s.status === 'error') {
        console.error('Fetch error:', s.error);
        return false;
      }
      console.log('Fetch status:', s.status, s.progress?.step, JSON.stringify(s.progress?.loaded || {}));
    } catch (e) {
      console.warn('Fetch-status error:', e.message);
    }
    await wait(10000);
  }
  console.error('Fetch timeout after ' + maxWaitMs + 'ms');
  return false;
}

async function main() {
  // 1. Wait for any current fetch to finish
  console.log('\n[1] Checking current fetch status...');
  const status1 = await axios.get(API + '/api/amo/fetch-status', { timeout: 10000 });
  if (status1.data.status === 'loading') {
    console.log('[1] Fetch is loading, waiting...');
    if (!(await pollFetchStatus(600000))) {
      console.error('Current fetch failed or timed out');
      process.exit(1);
    }
  } else {
    console.log('[1] No active fetch. Status:', status1.data.status);
  }

  // 2. Trigger new fetch for pipeline 9408314
  console.log('\n[2] Triggering fetch for pipeline', PIPELINE_ID, '...');
  const fetchResp = await axios.post(API + '/api/amo/fetch', { pipelineId: PIPELINE_ID }, { timeout: 10000 });
  console.log('[2] Fetch triggered:', fetchResp.data.message);

  // 3. Wait for new fetch to complete
  console.log('\n[3] Waiting for fetch to complete...');
  if (!(await pollFetchStatus(300000))) {
    console.error('Pipeline 9408314 fetch failed or timed out');
    process.exit(1);
  }

  // 4. Verify our test deal is in cache
  console.log('\n[4] Checking if test lead', LEAD_ID, 'is in cache...');
  const entR = await axios.get(API + '/api/amo/entities?type=leads&search=ТЕСТ+МИГРАЦИИ&limit=50', { timeout: 10000 });
  const testLeads = (entR.data.items || []).filter(l => l.id === LEAD_ID);
  if (testLeads.length === 0) {
    console.warn('[4] WARNING: test lead not found in cache by name search. Checking by looking at total...');
    const allR = await axios.get(API + '/api/amo/entities?type=leads&limit=1', { timeout: 10000 });
    console.log('[4] Total leads in cache:', allR.data.total);
  } else {
    console.log('[4] Test lead found:', testLeads[0].id, testLeads[0].name);
  }

  // 5. Get stage mapping
  console.log('\n[5] Getting stage mapping...');
  let stageMapping = {};
  try {
    const fs2 = require('fs-extra');
    const path2 = require('path');
    const cfg2 = require('./src/config');
    const stagePath = path2.resolve(cfg2.backupDir, 'stage_mapping.json');
    if (fs2.existsSync(stagePath)) {
      stageMapping = fs2.readJsonSync(stagePath);
      console.log('[5] Stage mapping loaded. Keys:', Object.keys(stageMapping).length);
    } else {
      console.warn('[5] Stage mapping file not found — will use empty mapping');
    }
  } catch (e) {
    console.warn('[5] Could not load stage mapping:', e.message);
  }

  // 6. Run transfer
  console.log('\n[6] Calling /api/migration/transfer-deals for lead', LEAD_ID, '...');
  const transferResp = await axios.post(API + '/api/migration/transfer-deals', {
    leadIds: [LEAD_ID],
    stageMapping,
  }, { timeout: 120000 });

  const r = transferResp.data;
  console.log('\n=== РЕЗУЛЬТАТ ПЕРВОГО ПЕРЕНОСА ===');
  console.log('requested:', r.requested, '| found:', r.found);
  console.log('transferred:', JSON.stringify(r.transferred));
  console.log('skipped:', JSON.stringify(r.skipped));
  console.log('notesDetail:', JSON.stringify(r.notesDetail));
  console.log('tasksDetail:', JSON.stringify(r.tasksDetail));
  console.log('createdIds.leads:', r.createdIds?.leads);
  console.log('createdIds.contacts:', r.createdIds?.contacts);
  console.log('createdIds.companies:', r.createdIds?.companies);
  console.log('createdIds.tasks:', r.createdIds?.tasks?.length);
  console.log('createdIds.notes:', r.createdIds?.notes?.length);
  if (r.warnings?.length) console.log('WARNINGS:', r.warnings);
  if (r.errors?.length) console.log('ERRORS:', r.errors);
}

main().catch(e => {
  if (e.response) console.error('API ERROR', e.response.status, JSON.stringify(e.response.data));
  else console.error('ERROR:', e.message);
  process.exit(1);
});
