// Diagnostic + comprehensive fix for V1.6.19
// 3 bugs: counter delay, slow countdown, STOP state
const fs = require('fs');
const http = require('http');

function get(path) {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3008/api/migration/' + path, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function diagnose() {
  const st = await get('batch-status');
  const stats = await get('batch-stats');
  console.log('=== CURRENT STATE ===');
  console.log('status:', st.status);
  console.log('autoRunActive:', st.autoRunActive);
  console.log('step:', st.step);
  console.log('batch-status stats:', JSON.stringify(st.stats));
  console.log('batch-stats:', JSON.stringify(stats));
  console.log('countdown:', st.autoRunCountdown);
  console.log('');
  
  // Check: does batch-status have alreadyMigrated?
  console.log('=== BUG ANALYSIS ===');
  console.log('BUG 1 - Counter: batch-status.stats has alreadyMigrated?', 'alreadyMigrated' in (st.stats || {}));
  console.log('  batch-stats has alreadyMigrated?', 'alreadyMigrated' in stats);
  console.log('  → Display uses: batchStats.alreadyMigrated ?? batchStats.totalTransferred');
  console.log('  → d.stats from polling only has totalTransferred (no alreadyMigrated)');
  console.log('  → setBatchStats merges { totalTransferred: N } but old alreadyMigrated persists');
  console.log('  → FIX: sync alreadyMigrated = d.stats.totalTransferred in polling');
  console.log('');
  console.log('BUG 2 - Countdown: polling does await getBatchStatus() every 1000ms');
  console.log('  → HTTP round-trip ~500-1500ms → effective interval 1.5-2.5s');
  console.log('  → FIX: client-side countdown ref, decrement locally, sync on server response');
  console.log('');
  console.log('BUG 3 - STOP inactive: handleStopAutoRun shows message but doesn\'t force refresh');
  console.log('  → After stop, status is completed but polling already stopped');
  console.log('  → FIX: force immediate status+stats refresh after stop');
}

async function applyFixes() {
  console.log('\n=== APPLYING FIXES ===\n');
  
  // ── FRONTEND FIX ──
  const ff = '/var/www/amoschool/frontend/src/App.jsx';
  let fe = fs.readFileSync(ff, 'utf8');
  let fixes = 0;

  // FIX 1: Counter — sync alreadyMigrated from d.stats.totalTransferred
  const old1 = `        // Instant counter sync from embedded stats — updates BEFORE status render
        if (d.stats) {
          setBatchStats(prev => ({ ...(prev || {}), ...d.stats }));
        }`;
  const new1 = `        // Instant counter sync from embedded stats — updates BEFORE status render
        if (d.stats) {
          setBatchStats(prev => ({
            ...(prev || {}),
            ...d.stats,
            alreadyMigrated: d.stats.totalTransferred,
          }));
        }`;
  if (fe.includes(old1)) { fe = fe.replace(old1, new1); fixes++; console.log('✅ FIX 1: alreadyMigrated synced from totalTransferred'); }
  else console.log('❌ FIX 1 not found');

  // FIX 2: Countdown — client-side decrement using useRef + local timer
  // Replace the entire polling useEffect with improved version that:
  // a) Uses lighter polling (no extra getBatchStats during auto-waiting)
  // b) Client-side countdown decrement between polls
  
  const oldPolling = `  // Poll batch status when batch is running
  useEffect(() => {
    if (batchStatus?.status !== 'running' && batchStatus?.status !== 'rolling_back' && batchStatus?.status !== 'auto-waiting') return;
    const iv = setInterval(async () => {
      try {
        const d = await api.getBatchStatus();
        // Crash detection: running → idle means server restarted mid-migration
        if (prevBatchStatusRef.current === 'running' && d.status === 'idle') {
          setCrashDetected(true);
        }
        prevBatchStatusRef.current = d.status;
        // Instant counter sync from embedded stats — updates BEFORE status render
        if (d.stats) {
          setBatchStats(prev => ({
            ...(prev || {}),
            ...d.stats,
            alreadyMigrated: d.stats.totalTransferred,
          }));
        }
        setBatchStatusData(d);
        if (d.status === 'auto-waiting' || d.status === 'completed' || d.status === 'idle' || d.status === 'auto-stopped') {
          api.getBatchStats().then(setBatchStats).catch(() => {});
        }
        if (d.status !== 'running' && d.status !== 'rolling_back' && d.status !== 'auto-waiting') {
          clearInterval(iv);
        }
      } catch {}
    }, 1000);
    return () => clearInterval(iv);
  }, [batchStatus?.status]);`;

  const newPolling = `  // Poll batch status when batch is running
  useEffect(() => {
    const st = batchStatus?.status;
    if (st !== 'running' && st !== 'rolling_back' && st !== 'auto-waiting') return;

    // Client-side countdown: decrement locally every 1s for smooth display
    let countdownTimer = null;
    if (st === 'auto-waiting') {
      countdownTimer = setInterval(() => {
        setBatchStatusData(prev => {
          if (!prev || prev.status !== 'auto-waiting' || !prev.autoRunCountdown) return prev;
          return { ...prev, autoRunCountdown: Math.max(0, prev.autoRunCountdown - 1) };
        });
      }, 1000);
    }

    // Server poll: every 2s fetch real state, sync counters + countdown
    const iv = setInterval(async () => {
      try {
        const d = await api.getBatchStatus();
        if (prevBatchStatusRef.current === 'running' && d.status === 'idle') {
          setCrashDetected(true);
        }
        prevBatchStatusRef.current = d.status;
        if (d.stats) {
          setBatchStats(prev => ({
            ...(prev || {}),
            ...d.stats,
            alreadyMigrated: d.stats.totalTransferred,
          }));
        }
        setBatchStatusData(d);
        if (d.status === 'completed' || d.status === 'idle' || d.status === 'auto-stopped') {
          api.getBatchStats().then(setBatchStats).catch(() => {});
          clearInterval(iv);
          if (countdownTimer) clearInterval(countdownTimer);
        }
      } catch {}
    }, 2000);

    return () => { clearInterval(iv); if (countdownTimer) clearInterval(countdownTimer); };
  }, [batchStatus?.status]);`;

  if (fe.includes(oldPolling)) { fe = fe.replace(oldPolling, newPolling); fixes++; console.log('✅ FIX 2: Client-side countdown + 2s server poll'); }
  else {
    console.log('❌ FIX 2 polling block not found, trying with FIX 1 already applied...');
    // The old1 was already replaced, check if the un-replaced version exists
  }

  // FIX 3: handleStopAutoRun — force immediate refresh
  const oldStop = fe.indexOf('const handleStopAutoRun');
  if (oldStop > -1) {
    const blockEnd = fe.indexOf('  };\n', oldStop + 100);
    const oldBlock = fe.substring(oldStop, blockEnd + 4);
    
    if (oldBlock.includes('setTimeout')) {
      // Replace setTimeout 2000 with immediate refresh
      const newBlock = `const handleStopAutoRun = async () => {
    try {
      const result = await api.stopAutoRun();
      const t = result.transferred || 0;
      const r = result.remaining || 0;
      const msg = result.wasRunning
        ? '\\u23f9 Стоп принят. Текущий пакет завершится.\\n\\ud83d\\udcca Перенесено: ' + t + '. Осталось: ' + r + '.\\n\\u25b6 Продолжить: «Авто ВСЕ» или «Перенести».'
        : '\\u23f9 Автозапуск остановлен.\\n\\ud83d\\udcca Перенесено: ' + t + '. Осталось: ' + r + '.\\n\\u25b6 Продолжить: «Авто ВСЕ» или «Перенести».';
      setMessage(msg);
      // Immediate refresh — no setTimeout delay
      const [d, s] = await Promise.all([api.getBatchStatus(), api.getBatchStats()]).catch(() => [null, null]);
      if (d) setBatchStatusData(d);
      if (s) setBatchStats(s);
    } catch (e) {
      setMessage('\\u274c ' + (e.response?.data?.error || e.message));
      // Still refresh to pick up state
      const [d, s] = await Promise.all([api.getBatchStatus(), api.getBatchStats()]).catch(() => [null, null]);
      if (d) setBatchStatusData(d);
      if (s) setBatchStats(s);
    }
  };`;
      fe = fe.substring(0, oldStop) + newBlock + fe.substring(blockEnd + 4);
      fixes++;
      console.log('✅ FIX 3: handleStopAutoRun — immediate refresh, no setTimeout');
    } else {
      console.log('⏭ FIX 3: handleStopAutoRun already fixed');
    }
  }

  fs.writeFileSync(ff, fe, 'utf8');
  console.log('Frontend: ' + fixes + ' fix(es). Lines: ' + fe.split('\n').length);

  // ── VERSIONS ──
  const vf = '/var/www/amoschool/backend/src/versions.js';
  let ve = fs.readFileSync(vf, 'utf8');
  if (!ve.includes('V1.6.19')) {
    const entry = `  {
    version: 'V1.6.19',
    date: '2026-03-09',
    title: 'Плавный обратный отсчёт + мгновенный счётчик',
    changes: [
      'Обратный отсчёт: клиентский таймер 1 сек (не зависит от сети)',
      'Счётчик «Перенесено всего» обновляется мгновенно при завершении пакета',
      'Кнопка Стоп: мгновенное обновление состояния без задержки 2 сек',
    ],
  },\n`;
    ve = ve.replace('const VERSIONS = [\n', 'const VERSIONS = [\n' + entry);
    fs.writeFileSync(vf, ve, 'utf8');
    console.log('✅ versions.js: V1.6.19 added');
  }
  
  console.log('\n=== DONE. Fixes applied: ' + fixes + ' ===');
}

async function main() {
  await diagnose();
  await applyFixes();
}

main().catch(e => { console.error(e); process.exit(1); });
