/**
 * SECOND TRANSFER TEST for lead 31652221
 * Verifies: new notes/tasks added, old ones NOT duplicated
 */
const http = require('http');
const fs = require('fs');

const LOG = '/tmp/migration_test_run2.log';
const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
};

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 3008, path, method,
      headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
    };
    const req = http.request(opts, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function pollFetch(timeoutMs = 300000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 8000));
    const r = await apiCall('GET', '/api/amo/fetch-status');
    const s = r.body;
    log(`Fetch status: ${s.status}, step: ${s.progress?.step}, leads: ${s.progress?.loaded?.leads || 0}`);
    if (s.status === 'done') return s;
    if (s.status === 'error') throw new Error('Fetch error: ' + s.error);
  }
  throw new Error('Fetch timeout');
}

async function main() {
  log('=== SECOND TRANSFER TEST (rerun dedup check) ===');
  log('Purpose: verify new notes/tasks transferred, old ones NOT duplicated');

  // Step 1: Read current migration index state (BEFORE second transfer)
  const indexPath = '/var/www/amoschool/backend/backups/migration_index.json';
  const idxBefore = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const beforeNotesLeads = Object.keys(idxBefore['notes_leads'] || {}).length;
  const beforeTasksLeads = Object.keys(idxBefore['tasks_leads'] || {}).length;
  const beforeNotesContacts = Object.keys(idxBefore['notes_contacts'] || {}).length;
  log(`BEFORE: notes_leads=${beforeNotesLeads}, tasks_leads=${beforeTasksLeads}, notes_contacts=${beforeNotesContacts}`);

  // Step 2: Re-fetch pipeline 9408314 to get new notes/tasks
  log('Triggering re-fetch for pipeline 9408314...');
  const fetchResp = await apiCall('POST', '/api/amo/fetch', { pipelineId: 9408314 });
  log('Fetch trigger: ' + JSON.stringify(fetchResp.body?.message || fetchResp.body));
  if (fetchResp.body?.message?.includes('уже выполняется') || fetchResp.body?.state?.status === 'loading') {
    log('Fetch already running, waiting...');
  }

  // Step 3: Wait for fetch to complete
  log('Waiting for fetch to complete...');
  const fetchDone = await pollFetch(600000);
  log('Fetch done! Counts: ' + JSON.stringify(fetchDone.progress?.loaded));

  // Step 4: Stage mapping
  const stagePath = '/var/www/amoschool/backend/backups/stage_mapping.json';
  const stageMapping = JSON.parse(fs.readFileSync(stagePath, 'utf8'));
  log(`Stage mapping: ${Object.keys(stageMapping).length} entries`);

  // Step 5: Run transfer AGAIN for lead 31652221
  log('Running SECOND transfer for lead 31652221...');
  const transferResp = await apiCall('POST', '/api/migration/transfer-deals', {
    leadIds: [31652221],
    stageMapping
  });

  log('Transfer HTTP status: ' + transferResp.status);
  const res = transferResp.body;
  log('=== SECOND TRANSFER RESULTS ===');
  log(`requested: ${res.requested}, found: ${res.found}`);
  log(`transferred: leads=${res.transferred?.leads} contacts=${res.transferred?.contacts} companies=${res.transferred?.companies} tasks=${res.transferred?.tasks} notes=${res.transferred?.notes}`);
  log(`skipped: leads=${res.skipped?.leads} contacts=${res.skipped?.contacts} companies=${res.skipped?.companies}`);
  log(`errors: ${JSON.stringify(res.errors)}`);
  log(`warnings: ${JSON.stringify(res.warnings)}`);
  log(`notesDetail: ${JSON.stringify(res.notesDetail)}`);
  log(`tasksDetail: ${JSON.stringify(res.tasksDetail)}`);

  // Step 6: Compare migration index AFTER
  const idxAfter = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const afterNotesLeads = Object.keys(idxAfter['notes_leads'] || {}).length;
  const afterTasksLeads = Object.keys(idxAfter['tasks_leads'] || {}).length;
  const afterNotesContacts = Object.keys(idxAfter['notes_contacts'] || {}).length;
  log(`AFTER: notes_leads=${afterNotesLeads}, tasks_leads=${afterTasksLeads}, notes_contacts=${afterNotesContacts}`);
  log(`Delta: notes_leads=+${afterNotesLeads - beforeNotesLeads}, tasks_leads=+${afterTasksLeads - beforeTasksLeads}, notes_contacts=+${afterNotesContacts - beforeNotesContacts}`);

  // Step 7: Summary
  log('');
  log('=== DEDUP CHECK SUMMARY ===');
  const newNotesTransferred = res.notesDetail?.leads?.transferred || 0;
  const newTasksTransferred = res.tasksDetail?.leads?.created || 0;
  if (newNotesTransferred > 0 || newTasksTransferred > 0) {
    log(`✅ NEW items transferred: ${newTasksTransferred} task(s), ${newNotesTransferred} lead note(s)`);
  } else {
    log(`⚠️ No new items transferred. Check if new notes/tasks were fetched from amo.`);
  }
  if (res.transferred?.leads === 0 && res.skipped?.leads === 1) {
    log(`✅ DEDUP WORKS: Lead not duplicated (skipped=1, transferred=0)`);
  } else {
    log(`❌ DEDUP ISSUE: transferred.leads=${res.transferred?.leads}`);
  }

  log('=== SECOND TRANSFER TEST COMPLETED ===');
}

main().catch(err => {
  log('FATAL: ' + err.message + '\n' + err.stack);
  process.exit(1);
});
