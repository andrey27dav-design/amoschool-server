/**
 * Focused countdown accuracy test
 * 1) Start auto-run
 * 2) Wait until auto-waiting
 * 3) Measure countdown every 500ms for 10 seconds
 * 4) Press STOP and measure response time
 */
const http = require('http');
const BASE = 'http://localhost:3008/api/migration';

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const opts = { hostname: url.hostname, port: url.port, path: url.pathname, method, headers: { 'Content-Type': 'application/json' } };
    const r = http.request(opts, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } }); });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const results = [];
  
  // Check state
  const s0 = await req('GET', '/batch-status');
  console.log('PRE: status=' + s0.status + ' offset=' + s0.batchPosition?.offset + ' transferred=' + s0.stats?.totalTransferred);
  
  if (s0.status !== 'idle' && s0.status !== 'completed') {
    console.log('ERROR: Not idle. Aborting.');
    return;
  }
  
  // Start auto-run
  console.log('\n>>> Starting auto-run (batchSize=1)...');
  await req('POST', '/batch-auto-start', { batchSize: 1 });
  
  // Wait for auto-waiting phase
  console.log('>>> Waiting for batch to complete...');
  for (let i = 0; i < 120; i++) {
    const s = await req('GET', '/batch-status');
    if (s.status === 'auto-waiting') {
      console.log('>>> Batch done! Entering countdown phase.\n');
      break;
    }
    if (s.status === 'error' || s.status === 'idle' || s.status === 'completed') {
      console.log('ERROR: Unexpected status: ' + s.status + ' — ' + s.step);
      return;
    }
    await sleep(500);
  }
  
  // Measure countdown every 500ms for 10 seconds
  console.log('=== COUNTDOWN MEASUREMENTS (polled every ~500ms) ===');
  const startTime = Date.now();
  
  for (let i = 0; i < 20; i++) {  // 20 * 500ms = 10s
    const t0 = Date.now();
    const s = await req('GET', '/batch-status');
    const t1 = Date.now();
    const elapsed = ((t1 - startTime) / 1000).toFixed(1);
    const latency = t1 - t0;
    
    if (s.status !== 'auto-waiting') {
      console.log(elapsed + 's: status changed to ' + s.status);
      break;
    }
    
    results.push({ elapsed: parseFloat(elapsed), countdown: s.autoRunCountdown, latency });
    console.log(elapsed + 's: countdown=' + s.autoRunCountdown + ' (latency=' + latency + 'ms)');
    await sleep(500);
  }
  
  // Analyze countdown steps
  console.log('\n=== ANALYSIS ===');
  for (let i = 1; i < results.length; i++) {
    const dt = (results[i].elapsed - results[i-1].elapsed).toFixed(1);
    const dc = results[i-1].countdown - results[i].countdown;
    console.log('Interval ' + (i) + ': dt=' + dt + 's, countdown dropped by ' + dc + ' (expected ~' + Math.round(parseFloat(dt)) + ')');
  }
  
  // Test STOP
  console.log('\n=== STOP TEST ===');
  const t_stop_start = Date.now();
  const stopResult = await req('POST', '/batch-auto-stop');
  const t_stop_end = Date.now();
  console.log('STOP response time: ' + (t_stop_end - t_stop_start) + 'ms');
  console.log('STOP result: wasRunning=' + stopResult.wasRunning + ' transferred=' + stopResult.transferred + ' remaining=' + stopResult.remaining);
  
  // Immediately check state
  const t_check_start = Date.now();
  const sAfter = await req('GET', '/batch-status');
  const t_check_end = Date.now();
  console.log('State check (' + (t_check_end - t_check_start) + 'ms): status=' + sAfter.status + ' countdown=' + sAfter.autoRunCountdown);
  
  // Wait 1.5s and check again (backend needs up to 1s to process flag)
  await sleep(1500);
  const sAfter2 = await req('GET', '/batch-status');
  console.log('State after 1.5s: status=' + sAfter2.status + ' countdown=' + sAfter2.autoRunCountdown);
  
  // Final stats
  const stats = await req('GET', '/batch-stats');
  console.log('\n=== FINAL STATE ===');
  console.log('alreadyMigrated=' + stats.alreadyMigrated + ' totalTransferred=' + stats.totalTransferred);
  console.log('COUNTER SYNC: ' + (stats.alreadyMigrated === stats.totalTransferred ? 'PASS' : 'FAIL'));
  
  console.log('\nDone.');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
