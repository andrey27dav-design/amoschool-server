// V1.6.21: Client-only countdown — no server requests during pause
// Backend: replace 60-second for-loop with waiting for continueAutoRun signal
// Frontend: pure client-side setInterval(1000) countdown, calls /batch-auto-continue at 0
// API: add continueAutoRun() method

const fs = require('fs');

// ═══════════════════════════════════════════════════════════════════════════════
// 1. BACKEND: batchMigrationService.js
// ═══════════════════════════════════════════════════════════════════════════════
const backendPath = '/var/www/amoschool/backend/src/services/batchMigrationService.js';
let backend = fs.readFileSync(backendPath, 'utf8');
const backendOrig = backend;

// 1a. Add continueFlag variable near the top (after autoRunStopFlag)
backend = backend.replace(
  'let autoRunStopFlag = false;   // user pressed stop during countdown',
  'let autoRunStopFlag = false;   // user pressed stop during countdown\nlet autoRunContinueFlag = false; // frontend signals: countdown done, start next batch'
);

// 1b. Replace the 60-second for-loop countdown with waiting for continueFlag
const oldCountdown = `      // ── 60-second countdown (check stop every second) ──
      logger.info(\`[auto-run] Batch done (+\${transferred}). Waiting 60s before next batch. Remaining: \${remainingAfter}\`);
      updateState({
        status: 'auto-waiting',
        step: \`⏳ Пауза 60 сек перед следующим пакетом. Перенесено: \${offsetAfter}/\${eligible.length}. Нажмите «Стоп» для отмены.\`,
        autoRunCountdown: 60,
      });

      let stopped = false;
      for (let sec = 60; sec > 0; sec--) {
        if (autoRunStopFlag || !autoRunEnabled) {
          stopped = true;
          break;
        }
        batchState.autoRunCountdown = sec;
        await new Promise(r => setTimeout(r, 1000));
      }

      if (stopped || autoRunStopFlag || !autoRunEnabled) {
        logger.info('[auto-run] Stopped by user during countdown.');
        updateState({
          status: 'completed',
          step: \`⏹ Автозапуск остановлен пользователем. Перенесено: \${offsetAfter}/\${eligible.length}\`,
          completedAt: new Date().toISOString(),
          autoRunCountdown: 0,
        });
        break;
      }`;

const newCountdown = `      // ── Wait for frontend to signal "continue" (client-side 60s countdown) ──
      logger.info(\`[auto-run] Batch done (+\${transferred}). Waiting for frontend continue signal. Remaining: \${remainingAfter}\`);
      autoRunContinueFlag = false;
      updateState({
        status: 'auto-waiting',
        step: \`⏳ Пауза перед следующим пакетом. Перенесено: \${offsetAfter}/\${eligible.length}. Нажмите «Стоп» для отмены.\`,
        autoRunCountdown: 60,
      });

      // Poll every 500ms for stop or continue signal (no heavy work — just flag checks)
      let stopped = false;
      while (!autoRunContinueFlag) {
        if (autoRunStopFlag || !autoRunEnabled) {
          stopped = true;
          break;
        }
        await new Promise(r => setTimeout(r, 500));
      }

      if (stopped || autoRunStopFlag || !autoRunEnabled) {
        logger.info('[auto-run] Stopped by user during countdown.');
        updateState({
          status: 'completed',
          step: \`⏹ Автозапуск остановлен пользователем. Перенесено: \${offsetAfter}/\${eligible.length}\`,
          completedAt: new Date().toISOString(),
          autoRunCountdown: 0,
        });
        break;
      }
      logger.info('[auto-run] Continue signal received, starting next batch.');`;

if (!backend.includes('for (let sec = 60; sec > 0; sec--)')) {
  console.error('ERROR: Cannot find countdown for-loop in backend!');
  process.exit(1);
}
backend = backend.replace(oldCountdown, newCountdown);

// 1c. Add continueAutoRun function (before module.exports or after stopAutoRun)
const continueFunc = `
  // ─── Continue auto-run (called by frontend after client-side countdown) ─────
  function continueAutoRun() {
    if (!autoRunEnabled) {
      return { ok: false, error: 'Автозапуск не активен' };
    }
    if (batchState.status !== 'auto-waiting') {
      return { ok: false, error: 'Не в состоянии ожидания' };
    }
    autoRunContinueFlag = true;
    logger.info('[auto-run] Continue signal received from frontend.');
    return { ok: true };
  }
`;

// Insert before module.exports
backend = backend.replace(
  /(\n\s*module\.exports\s*=\s*\{)/,
  continueFunc + '\n$1'
);

// 1d. Export continueAutoRun
backend = backend.replace(
  'stopAutoRun,',
  'stopAutoRun,\n    continueAutoRun,'
);

// 1e. Reset continueFlag in startAutoRun init and finally
backend = backend.replace(
  "autoRunStopFlag = false;\n    pauseRequestedFlag = false;\n    logger.info('[auto-run] Auto-run cycle started",
  "autoRunStopFlag = false;\n    autoRunContinueFlag = false;\n    pauseRequestedFlag = false;\n    logger.info('[auto-run] Auto-run cycle started"
);

backend = backend.replace(
  "autoRunStopFlag = false;\n    batchState.autoRunCountdown = 0;\n  }",
  "autoRunStopFlag = false;\n    autoRunContinueFlag = false;\n    batchState.autoRunCountdown = 0;\n  }"
);

if (backend === backendOrig) {
  console.error('ERROR: No backend changes made!');
  process.exit(1);
}
fs.writeFileSync(backendPath, backend, 'utf8');
console.log('✅ Backend: countdown replaced with continue-signal pattern');

// ═══════════════════════════════════════════════════════════════════════════════
// 2. BACKEND ROUTE: migration.js — add /batch-auto-continue endpoint
// ═══════════════════════════════════════════════════════════════════════════════
const routePath = '/var/www/amoschool/backend/src/routes/migration.js';
let routes = fs.readFileSync(routePath, 'utf8');
const routesOrig = routes;

const continueRoute = `
// POST /api/migration/batch-auto-continue — frontend signals: countdown done, start next batch
router.post('/batch-auto-continue', (req, res) => {
  const result = batchService.continueAutoRun();
  res.json(result);
});

`;

// Insert after batch-auto-stop route
routes = routes.replace(
  '// POST /api/migration/batch-auto-stop',
  continueRoute + '// POST /api/migration/batch-auto-stop'
);

if (routes === routesOrig) {
  console.error('ERROR: No route changes made!');
  process.exit(1);
}
fs.writeFileSync(routePath, routes, 'utf8');
console.log('✅ Route: /batch-auto-continue endpoint added');

// ═══════════════════════════════════════════════════════════════════════════════
// 3. FRONTEND API: api.js — add continueAutoRun method
// ═══════════════════════════════════════════════════════════════════════════════
const apiPath = '/var/www/amoschool/frontend/src/api.js';
let apiCode = fs.readFileSync(apiPath, 'utf8');
const apiOrig = apiCode;

apiCode = apiCode.replace(
  "export const stopAutoRun = () => api.post('/migration/batch-auto-stop').then(r => r.data);",
  "export const stopAutoRun = () => api.post('/migration/batch-auto-stop').then(r => r.data);\nexport const continueAutoRun = () => api.post('/migration/batch-auto-continue').then(r => r.data);"
);

if (apiCode === apiOrig) {
  console.error('ERROR: No api.js changes made!');
  process.exit(1);
}
fs.writeFileSync(apiPath, apiCode, 'utf8');
console.log('✅ API client: continueAutoRun() added');

// ═══════════════════════════════════════════════════════════════════════════════
// 4. FRONTEND: App.jsx — pure client-side countdown, no polling during pause
// ═══════════════════════════════════════════════════════════════════════════════
const appPath = '/var/www/amoschool/frontend/src/App.jsx';
let app = fs.readFileSync(appPath, 'utf8');
const appOrig = app;

// Replace the entire "Poll batch status + client-side countdown" useEffect
const oldUseEffect = `  // Poll batch status + client-side countdown
  useEffect(() => {
    const st = batchStatus?.status;
    if (st !== 'running' && st !== 'rolling_back' && st !== 'auto-waiting') return;

    // Client-side countdown: smooth 1s decrement (no network dependency)
    let countdownTimer = null;
    if (st === 'auto-waiting') {
      countdownTimer = setInterval(() => {
        setBatchStatusData(prev => {
          if (!prev || prev.status !== 'auto-waiting' || !prev.autoRunCountdown || prev.autoRunCountdown <= 0) return prev;
          return { ...prev, autoRunCountdown: prev.autoRunCountdown - 5 };
        });
      }, 5000);
    }

    // Server poll every 5s: sync real state + counters
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
        // Wait 5s between polls
        await new Promise(r => setTimeout(r, 5000));
      }
    };
    poll();

    return () => { polling = false; if (countdownTimer) clearInterval(countdownTimer); };
  }, [batchStatus?.status]);`;

const newUseEffect = `  // Poll batch status (only when running/rolling_back) + pure client countdown (auto-waiting)
  useEffect(() => {
    const st = batchStatus?.status;
    if (st !== 'running' && st !== 'rolling_back' && st !== 'auto-waiting') return;

    // ── auto-waiting: pure client-side countdown 60→0, then signal server ──
    if (st === 'auto-waiting') {
      let cancelled = false;
      const countdownTimer = setInterval(() => {
        if (cancelled) return;
        setBatchStatusData(prev => {
          if (!prev || prev.status !== 'auto-waiting') return prev;
          const next = (prev.autoRunCountdown || 60) - 1;
          if (next <= 0) {
            // Countdown done — tell server to start next batch
            api.continueAutoRun().then(() => {
              // After continue, fetch fresh status to transition to 'running'
              api.getBatchStatus().then(d => {
                if (!cancelled) setBatchStatusData(d);
              }).catch(() => {});
            }).catch(() => {});
            return { ...prev, autoRunCountdown: 0, status: 'running', step: '🔄 Запуск следующего пакета...' };
          }
          return { ...prev, autoRunCountdown: next };
        });
      }, 1000);
      return () => { cancelled = true; clearInterval(countdownTimer); };
    }

    // ── running/rolling_back: poll server for progress ──
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
          if (d.status !== 'running' && d.status !== 'rolling_back') {
            api.getBatchStats().then(setBatchStats).catch(() => {});
            break;
          }
        } catch {}
        await new Promise(r => setTimeout(r, 2000));
      }
    };
    poll();

    return () => { polling = false; };
  }, [batchStatus?.status]);`;

if (!app.includes('Server poll every 5s')) {
  console.error('ERROR: Cannot find old useEffect in App.jsx!');
  process.exit(1);
}
app = app.replace(oldUseEffect, newUseEffect);

if (app === appOrig) {
  console.error('ERROR: No App.jsx changes made!');
  process.exit(1);
}
fs.writeFileSync(appPath, app, 'utf8');
console.log('✅ Frontend: pure client-side countdown, no server requests during pause');

// ═══════════════════════════════════════════════════════════════════════════════
// 5. VERSIONS
// ═══════════════════════════════════════════════════════════════════════════════
const versionsPath = '/var/www/amoschool/backend/src/versions.js';
let versions = fs.readFileSync(versionsPath, 'utf8');

versions = versions.replace(
  "const VERSIONS = [\n  {",
  `const VERSIONS = [
  {
    version: 'V1.6.21',
    date: '2026-03-09',
    title: 'Клиентский обратный отсчёт без серверных запросов',
    changes: [
      'Обратный отсчёт 60→0 работает полностью на клиенте (setInterval 1с)',
      'Во время паузы сервер НЕ опрашивается — нет задержек и хаоса',
      'По окончании обратного отсчёта клиент отправляет команду серверу на запуск следующего пакета',
      'Новый endpoint: POST /batch-auto-continue',
    ],
  },
  {`
);

fs.writeFileSync(versionsPath, versions, 'utf8');
console.log('✅ Versions: V1.6.21 added');
console.log('\n=== ALL CHANGES APPLIED SUCCESSFULLY ===');
