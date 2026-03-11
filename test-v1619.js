/**
 * V1.6.19 Integration Test Script
 * Tests: countdown timer accuracy, counter sync, STOP button response
 * Run on server: node /tmp/test-v1619.js
 */
const http = require('http');

const BASE = 'http://localhost:3008/api/migration';

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const r = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch { resolve(d); }
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   V1.6.19 INTEGRATION TEST              ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // ── Phase 0: Check current state ──
  const st0 = await req('GET', '/batch-status');
  console.log('[PRE] Status:', st0.status, '| Offset:', st0.batchPosition?.offset, '| Transferred:', st0.stats?.totalTransferred);
  
  if (st0.status === 'running' || st0.status === 'auto-waiting') {
    console.log('⚠ Migration is already running. Aborting test.');
    process.exit(1);
  }

  // Get initial stats
  const stats0 = await req('GET', '/batch-stats');
  const initTransferred = stats0.alreadyMigrated || stats0.totalTransferred || 0;
  console.log('[PRE] alreadyMigrated:', stats0.alreadyMigrated, '| totalTransferred:', stats0.totalTransferred);

  // ── Phase 1: Start auto-run (batchSize=1) ──
  console.log('\n═══ TEST 1: START AUTO-RUN ═══');
  const startResp = await req('POST', '/batch-auto-start', { batchSize: 1 });
  console.log('[START] Response:', JSON.stringify(startResp).substring(0, 200));

  // ── Phase 2: Wait for batch to start running ──
  console.log('\n═══ TEST 2: MONITOR BATCH EXECUTION ═══');
  let countdownStarted = false;
  let batchCompleted = false;
  let transferredAfterBatch = 0;
  
  // Poll rapidly while running
  for (let i = 0; i < 120; i++) {  // max 2 minutes
    const st = await req('GET', '/batch-status');
    const now = Date.now();
    
    if (st.status === 'running') {
      console.log(`[${i}s] status=running step="${(st.step || '').substring(0, 80)}" totalTransferred=${st.stats?.totalTransferred}`);
    } else if (st.status === 'auto-waiting') {
      if (!countdownStarted) {
        countdownStarted = true;
        transferredAfterBatch = st.stats?.totalTransferred || 0;
        console.log(`\n[BATCH DONE] totalTransferred=${transferredAfterBatch} (was ${initTransferred})`);
        console.log('\n═══ TEST 3: COUNTDOWN TIMER ACCURACY ═══');
      }
      console.log(`[${i}s] countdown=${st.autoRunCountdown} totalTransferred=${st.stats?.totalTransferred}`);
      
      // After 5 seconds of countdown, test STOP
      if (st.autoRunCountdown && st.autoRunCountdown <= 55) {
        console.log('\n═══ TEST 4: STOP BUTTON ═══');
        const t1 = Date.now();
        const stopResp = await req('POST', '/batch-auto-stop');
        const t2 = Date.now();
        console.log(`[STOP] Response time: ${t2 - t1}ms`);
        console.log(`[STOP] wasRunning=${stopResp.wasRunning} transferred=${stopResp.transferred} remaining=${stopResp.remaining}`);
        
        // Immediately check state
        const stAfter = await req('GET', '/batch-status');
        const statsAfter = await req('GET', '/batch-stats');
        console.log(`[AFTER STOP] status=${stAfter.status} countdown=${stAfter.autoRunCountdown}`);
        console.log(`[AFTER STOP] alreadyMigrated=${statsAfter.alreadyMigrated} totalTransferred=${statsAfter.totalTransferred}`);
        
        batchCompleted = true;
        break;
      }
    } else if (st.status === 'completed' || st.status === 'idle') {
      if (!countdownStarted) {
        console.log(`[${i}s] status=${st.status} — batch finished without auto-waiting?`);
      }
      break;
    } else if (st.status === 'error') {
      console.log(`[${i}s] ERROR: ${st.step}`);
      break;
    }
    
    await sleep(1000);
  }

  // ── Summary ──
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   TEST RESULTS                           ║');
  console.log('╚══════════════════════════════════════════╝');
  
  const stFinal = await req('GET', '/batch-status');
  const statsFinal = await req('GET', '/batch-stats');
  
  console.log(`Status: ${stFinal.status}`);
  console.log(`Offset: ${stFinal.batchPosition?.offset}`);
  console.log(`totalTransferred: ${statsFinal.totalTransferred}`);
  console.log(`alreadyMigrated: ${statsFinal.alreadyMigrated}`);
  
  // Verify counter sync
  const counterMatch = (statsFinal.alreadyMigrated === statsFinal.totalTransferred);
  console.log(`\n✅ Counter sync (alreadyMigrated === totalTransferred): ${counterMatch ? 'PASS' : 'FAIL (' + statsFinal.alreadyMigrated + ' vs ' + statsFinal.totalTransferred + ')'}`);
  
  // Verify transfer happened
  const newTransferred = statsFinal.totalTransferred || 0;
  const transferIncrease = newTransferred > initTransferred;
  console.log(`✅ Transfer increased (${initTransferred} → ${newTransferred}): ${transferIncrease ? 'PASS' : 'FAIL'}`);
  
  // Verify stop worked (status should not be running/auto-waiting)
  const stopped = (stFinal.status !== 'running' && stFinal.status !== 'auto-waiting');
  console.log(`✅ Stop effective (status=${stFinal.status}): ${stopped ? 'PASS' : 'FAIL'}`);
  
  console.log('\n═══ Done ═══');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
