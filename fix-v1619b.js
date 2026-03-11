// V1.6.19 fixes — no HTTP calls, just file patches
const fs = require('fs');

const ff = '/var/www/amoschool/frontend/src/App.jsx';
let fe = fs.readFileSync(ff, 'utf8');
let fixes = 0;

// FIX 1+2: Replace entire polling useEffect
// - Client-side countdown timer (1s smooth)
// - Server poll every 2s (not 1s — avoids network lag making countdown stutter)
// - alreadyMigrated synced from totalTransferred
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
          setBatchStats(prev => ({ ...(prev || {}), ...d.stats }));
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

const newPolling = `  // Poll batch status + client-side countdown
  useEffect(() => {
    const st = batchStatus?.status;
    if (st !== 'running' && st !== 'rolling_back' && st !== 'auto-waiting') return;

    // Client-side countdown: smooth 1s decrement (no network dependency)
    let countdownTimer = null;
    if (st === 'auto-waiting') {
      countdownTimer = setInterval(() => {
        setBatchStatusData(prev => {
          if (!prev || prev.status !== 'auto-waiting' || !prev.autoRunCountdown || prev.autoRunCountdown <= 0) return prev;
          return { ...prev, autoRunCountdown: prev.autoRunCountdown - 1 };
        });
      }, 1000);
    }

    // Server poll every 2s: sync real state + counters
    let polling = true;
    const poll = async () => {
      while (polling) {
        try {
          const d = await api.getBatchStatus();
          if (!polling) break;
          if (prevBatchStatusRef.current === 'running' && d.status === 'idle') {
            setCrashDetected(true);
          }
          prevBatchStatusRef.current = d.status;
          // Sync counters instantly from embedded stats
          if (d.stats) {
            setBatchStats(prev => ({
              ...(prev || {}),
              ...d.stats,
              alreadyMigrated: d.stats.totalTransferred,
            }));
          }
          setBatchStatusData(d);
          // Terminal states: fetch full stats and stop polling
          if (d.status !== 'running' && d.status !== 'rolling_back' && d.status !== 'auto-waiting') {
            api.getBatchStats().then(setBatchStats).catch(() => {});
            break;
          }
        } catch {}
        // Wait 2s between polls
        await new Promise(r => setTimeout(r, 2000));
      }
    };
    poll();

    return () => { polling = false; if (countdownTimer) clearInterval(countdownTimer); };
  }, [batchStatus?.status]);`;

if (fe.includes(oldPolling)) {
  fe = fe.replace(oldPolling, newPolling);
  fixes++;
  console.log('✅ FIX 1+2: Client-side countdown + 2s server poll + alreadyMigrated sync');
} else {
  console.log('❌ FIX 1+2: polling block not found');
  // Try to find what's there
  const idx = fe.indexOf('// Poll batch status');
  if (idx > -1) console.log('  Found at index', idx, '- first 200 chars:', fe.substring(idx, idx + 200));
}

// FIX 3: handleStopAutoRun — immediate refresh, no setTimeout delay
const stopIdx = fe.indexOf('const handleStopAutoRun');
if (stopIdx > -1) {
  const blockEnd = fe.indexOf('\n  };\n', stopIdx + 50);
  if (blockEnd > -1) {
    const oldBlock = fe.substring(stopIdx, blockEnd + 5);
    if (oldBlock.includes('setTimeout') || oldBlock.includes('2000')) {
      const newStop = `const handleStopAutoRun = async () => {
    try {
      const result = await api.stopAutoRun();
      const t = result.transferred || 0;
      const r = result.remaining || 0;
      const msg = result.wasRunning
        ? '\u23f9 Стоп принят. Текущий пакет завершится.\\n\ud83d\udcca Перенесено: ' + t + '. Осталось: ' + r + '.\\n\u25b6 Продолжить: «Авто ВСЕ» или «Перенести».'
        : '\u23f9 Автозапуск остановлен.\\n\ud83d\udcca Перенесено: ' + t + '. Осталось: ' + r + '.\\n\u25b6 Продолжить: «Авто ВСЕ» или «Перенести».';
      setMessage(msg);
      // Immediate state refresh
      const [d, s] = await Promise.all([api.getBatchStatus(), api.getBatchStats()]).catch(() => [null, null]);
      if (d) setBatchStatusData(d);
      if (s) setBatchStats(s);
    } catch (e) {
      setMessage('\u274c ' + (e.response?.data?.error || e.message));
      const [d, s] = await Promise.all([api.getBatchStatus(), api.getBatchStats()]).catch(() => [null, null]);
      if (d) setBatchStatusData(d);
      if (s) setBatchStats(s);
    }
  };`;
      fe = fe.substring(0, stopIdx) + newStop + fe.substring(blockEnd + 5);
      fixes++;
      console.log('✅ FIX 3: handleStopAutoRun — immediate refresh');
    } else {
      console.log('⏭ FIX 3: no setTimeout found in handleStopAutoRun');
    }
  }
}

fs.writeFileSync(ff, fe, 'utf8');
console.log('\nFrontend: ' + fixes + ' fix(es). Lines: ' + fe.split('\n').length);

// ── VERSIONS ──
const vf = '/var/www/amoschool/backend/src/versions.js';
let ve = fs.readFileSync(vf, 'utf8');
if (!ve.includes('V1.6.19')) {
  const entry = `  {
    version: 'V1.6.19',
    date: '2026-03-09',
    title: 'Плавный обратный отсчёт + мгновенный счётчик',
    changes: [
      'Обратный отсчёт: клиентский таймер 1 сек (не зависит от задержки сети)',
      'Счётчик «Перенесено всего» обновляется мгновенно при завершении пакета',
      'Кнопка Стоп: мгновенное обновление состояния без задержки',
    ],
  },\n`;
  ve = ve.replace('const VERSIONS = [\n', 'const VERSIONS = [\n' + entry);
  fs.writeFileSync(vf, ve, 'utf8');
  console.log('✅ versions.js: V1.6.19 added');
}

console.log('\nDone. Run: npm run build + pm2 restart + git commit');
