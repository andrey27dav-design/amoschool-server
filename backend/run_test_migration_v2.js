/**
 * Direct migration test for lead 31652221 (pipeline 9408314)
 * Runs entirely via HTTP API on localhost:3008
 */
const http = require('http');
const fs = require('fs');

const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync('/tmp/migration_test_v2.log', line + '\n');
};

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port: 3008,
      path,
      method,
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
  throw new Error('Fetch timeout after ' + timeoutMs + 'ms');
}

async function main() {
  log('=== Migration Test V2 Started ===');
  log('Test lead: 31652221, pipeline: 9408314');

  // Step 1: Trigger fetch for pipeline 9408314
  log('Step 1: Triggering fetch for pipeline 9408314...');
  const fetchResp = await apiCall('POST', '/api/amo/fetch', { pipelineId: 9408314 });
  log('Fetch trigger response: ' + JSON.stringify(fetchResp.body?.message || fetchResp.body));

  // Step 2: Wait for fetch to complete
  log('Step 2: Waiting for fetch to complete (polling every 8s)...');
  const fetchDone = await pollFetch(600000);
  log('Fetch completed! Counts: ' + JSON.stringify(fetchDone.progress?.loaded));

  // Step 3: Verify test lead in cache
  log('Step 3: Searching for test lead in cache...');
  const entResp = await apiCall('GET', '/api/amo/entities?type=leads&search=%D0%A2%D0%95%D0%A1%D0%A2%20%D0%9C%D0%98%D0%93%D0%A0%D0%90%D0%A6%D0%98%D0%98&limit=10');
  const found = entResp.body?.items || [];
  log(`Found ${found.length} test leads: ` + found.map(l => `${l.id}:${l.name}`).join(', '));

  const testLead = found.find(l => l.id === 31652221) || found[0];
  if (!testLead) {
    log('ERROR: Test lead 31652221 NOT found in cache! Check pipeline fetch.');
    // Try direct search by ID
    const allLeads = await apiCall('GET', '/api/amo/entities?type=leads&limit=500');
    const byId = (allLeads.body?.items || []).find(l => l.id === 31652221);
    if (byId) log('Found by ID scan: ' + JSON.stringify(byId.name));
    else log('Lead 31652221 not in fetched data. Pipeline 9408314 fetch may have returned 0 leads.');
    
    // Check all leads count
    log(`Total leads in cache: ${allLeads.body?.total}`);
  } else {
    log('Test lead found: ' + JSON.stringify({ id: testLead.id, name: testLead.name, pipeline_id: testLead.pipeline_id, status_id: testLead.status_id }));
  }

  // Step 4: Load stage mapping
  log('Step 4: Loading stage mapping...');
  const stagePath = '/var/www/amoschool/backend/backups/stage_mapping.json';
  let stageMapping = {};
  if (fs.existsSync(stagePath)) {
    stageMapping = JSON.parse(fs.readFileSync(stagePath, 'utf8'));
    const keys = Object.keys(stageMapping);
    log(`Stage mapping loaded: ${keys.length} entries. Keys sample: ` + keys.slice(0, 5).join(', '));
  } else {
    log('Stage mapping file not found, using empty object');
  }

  // Step 5: Run transfer for lead 31652221
  log('Step 5: Running transfer for lead 31652221...');
  log('Transfer request: leadIds=[31652221], stageMapping=' + JSON.stringify(stageMapping).slice(0, 200) + '...');
  
  const transferResp = await apiCall('POST', '/api/migration/transfer-deals', {
    leadIds: [31652221],
    stageMapping
  });
  
  log('Transfer HTTP status: ' + transferResp.status);
  log('Transfer response: ' + JSON.stringify(transferResp.body, null, 2));

  // Step 6: Check migration index
  log('Step 6: Checking migration index...');
  const indexPath = '/var/www/amoschool/backend/backups/migration_index.json';
  if (fs.existsSync(indexPath)) {
    const idx = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const entities = Object.keys(idx);
    log('Migration index entities: ' + entities.join(', '));
    for (const e of entities) {
      const items = idx[e];
      const count = Array.isArray(items) ? items.length : Object.keys(items).length;
      log(`  ${e}: ${count} items`);
    }
    // Check if our test lead is registered
    const leads = idx['leads'] || {};
    const found31 = Object.entries(leads).find(([k,v]) => k == '31652221' || v == 31652221);
    log('Test lead 31652221 in migration index: ' + (found31 ? JSON.stringify(found31) : 'NOT FOUND'));
  } else {
    log('Migration index file not found');
  }

  log('=== Migration Test V2 COMPLETED ===');
}

main().catch(err => {
  log('FATAL ERROR: ' + err.message + '\n' + err.stack);
  process.exit(1);
});
