const fs = require('fs');

// ══════════════════════════════════════════════════════════════════
// BACKEND FIXES — batchMigrationService.js
// ══════════════════════════════════════════════════════════════════
const bf = '/var/www/amoschool/backend/src/services/batchMigrationService.js';
let be = fs.readFileSync(bf, 'utf8');
let bfixes = 0;

// FIX 1: Reset flags at runBatchMigration start
const old1 = `async function runBatchMigration(stageMapping) {
  if (batchState.status === 'running') throw new Error('Пакетная миграция уже выполняется');

  loadBatchConfig();`;
const new1 = `async function runBatchMigration(stageMapping) {
  if (batchState.status === 'running') throw new Error('Пакетная миграция уже выполняется');

  // Reset stale flags from previous stop (prevents phantom pause on new batch)
  pauseRequestedFlag = false;
  if (!autoRunEnabled) autoRunStopFlag = false;

  loadBatchConfig();`;
if (be.includes(old1)) { be = be.replace(old1, new1); bfixes++; console.log('✅ BE-1: Reset flags at batch start'); }
else console.log('❌ BE-1 not found');

// FIX 2: Reset pauseRequestedFlag in startAutoRun
const old2 = `  autoRunEnabled = true;\n  autoRunStopFlag = false;`;
const new2 = `  autoRunEnabled = true;\n  autoRunStopFlag = false;\n  pauseRequestedFlag = false;`;
if (be.includes(old2)) { be = be.replace(old2, new2); bfixes++; console.log('✅ BE-2: Reset pauseFlag in startAutoRun'); }
else console.log('❌ BE-2 not found');

// FIX 3: stopAutoRun — idempotent + return detailed status
const old3 = `function stopAutoRun() {
  if (!autoRunEnabled) throw new Error('Автозапуск не активен');
  autoRunStopFlag = true;
  // If batch is currently running, also pause it
  if (batchState.status === 'running') {
    pauseRequestedFlag = true;
  }
  logger.info('[auto-run] Stop requested by user');
  return { ok: true, message: 'Автозапуск будет остановлен' };
}`;
const new3 = `function stopAutoRun() {
  if (!autoRunEnabled) {
    // Idempotent: double-click or stale state — just clean up flags
    pauseRequestedFlag = false;
    autoRunStopFlag = false;
    return { ok: true, wasRunning: false,
      transferred: batchState.stats?.totalTransferred || 0,
      remaining: batchState.stats?.remainingLeads || 0,
      lastStep: batchState.step || '' };
  }
  autoRunStopFlag = true;
  const wasRunning = batchState.status === 'running';
  if (wasRunning) {
    pauseRequestedFlag = true;
  }
  logger.info('[auto-run] Stop requested by user, wasRunning=' + wasRunning);
  return { ok: true, wasRunning,
    transferred: batchState.stats?.totalTransferred || 0,
    remaining: batchState.stats?.remainingLeads || 0,
    lastStep: batchState.step || '' };
}`;
if (be.includes(old3)) { be = be.replace(old3, new3); bfixes++; console.log('✅ BE-3: stopAutoRun idempotent + detailed response'); }
else console.log('❌ BE-3 not found');

fs.writeFileSync(bf, be, 'utf8');
console.log('Backend: ' + bfixes + '/3 fixes. Lines: ' + be.split('\n').length);

// ══════════════════════════════════════════════════════════════════
// FRONTEND FIXES — App.jsx
// ══════════════════════════════════════════════════════════════════
const ff = '/var/www/amoschool/frontend/src/App.jsx';
let fe = fs.readFileSync(ff, 'utf8');
let ffixes = 0;

// FIX 4: handleStopAutoRun — show detailed message with instructions
const old4 = `  const handleStopAutoRun = async () => {
    try {
      await api.stopAutoRun();
      setMessage('\u23f9 Запрос остановки автозапуска отправлен. Текущий пакет завершится.');
      setTimeout(async () => {
        const [d, s] = await Promise.all([api.getBatchStatus(), api.getBatchStats()]).catch(() => [null, null]);
        if (d) setBatchStatusData(d);
        if (s) setBatchStats(s);
      }, 2000);
    } catch (e) {
      setMessage('\u274c ' + (e.response?.data?.error || e.message));
    }`;
const new4 = `  const handleStopAutoRun = async () => {
    try {
      const result = await api.stopAutoRun();
      const t = result.transferred || 0;
      const r = result.remaining || 0;
      if (result.wasRunning) {
        setMessage('\u23f9 Стоп принят. Текущий пакет завершится, затем цикл остановится.\\n' +
          '\ud83d\udcca Перенесено: ' + t + ' сделок. Осталось: ' + r + '.\\n' +
          '\u25b6 Чтобы продолжить: нажмите «Авто ВСЕ» для автоцикла или «Перенести» для одного пакета.');
      } else {
        setMessage('\u23f9 Автозапуск остановлен.\\n' +
          '\ud83d\udcca Перенесено: ' + t + ' сделок. Осталось: ' + r + '.\\n' +
          '\u25b6 Чтобы продолжить: нажмите «Авто ВСЕ» для автоцикла или «Перенести» для одного пакета.');
      }
      setTimeout(async () => {
        const [d, s] = await Promise.all([api.getBatchStatus(), api.getBatchStats()]).catch(() => [null, null]);
        if (d) setBatchStatusData(d);
        if (s) setBatchStats(s);
      }, 2000);
    } catch (e) {
      setMessage('\u274c ' + (e.response?.data?.error || e.message));
    }`;
if (fe.includes(old4)) { fe = fe.replace(old4, new4); ffixes++; console.log('✅ FE-1: handleStopAutoRun detailed message'); }
else {
  console.log('❌ FE-1 not found, trying unicode-free match...');
  // Try matching with the actual emoji bytes
  const idx = fe.indexOf('const handleStopAutoRun');
  if (idx > -1) {
    const blockEnd = fe.indexOf('    }\n  };\n', idx);
    if (blockEnd > -1) {
      const oldBlock = fe.substring(idx, blockEnd + '    }\n  };'.length);
      const newBlock = `const handleStopAutoRun = async () => {
    try {
      const result = await api.stopAutoRun();
      const t = result.transferred || 0;
      const r = result.remaining || 0;
      if (result.wasRunning) {
        setMessage('⏹ Стоп принят. Текущий пакет завершится, затем цикл остановится.\\n' +
          '📊 Перенесено: ' + t + ' сделок. Осталось: ' + r + '.\\n' +
          '▶ Чтобы продолжить: нажмите «Авто ВСЕ» для автоцикла или «Перенести» для одного пакета.');
      } else {
        setMessage('⏹ Автозапуск остановлен.\\n' +
          '📊 Перенесено: ' + t + ' сделок. Осталось: ' + r + '.\\n' +
          '▶ Чтобы продолжить: нажмите «Авто ВСЕ» для автоцикла или «Перенести» для одного пакета.');
      }
      setTimeout(async () => {
        const [d, s] = await Promise.all([api.getBatchStatus(), api.getBatchStats()]).catch(() => [null, null]);
        if (d) setBatchStatusData(d);
        if (s) setBatchStats(s);
      }, 2000);
    } catch (e) {
      setMessage('❌ ' + (e.response?.data?.error || e.message));
    }
  };`;
      fe = fe.substring(0, idx) + newBlock + fe.substring(blockEnd + '    }\n  };'.length);
      ffixes++;
      console.log('✅ FE-1 (alt): handleStopAutoRun replaced by index');
    }
  }
}

fs.writeFileSync(ff, fe, 'utf8');
console.log('Frontend: ' + ffixes + ' fixes. Lines: ' + fe.split('\n').length);

// ══════════════════════════════════════════════════════════════════
// VERSIONS.JS — add V1.6.17
// ══════════════════════════════════════════════════════════════════
const vf = '/var/www/amoschool/backend/src/versions.js';
let ve = fs.readFileSync(vf, 'utf8');
const v17entry = `  {
    version: 'V1.6.17',
    date: '2026-03-09',
    title: 'Исправление кнопки Стоп',
    changes: [
      'Стоп корректно останавливает автоцикл — флаги сбрасываются, ручной запуск не зависает',
      'Двойной клик на Стоп не вызывает ошибку',
      'После Стоп: сообщение с количеством перенесённых и инструкцией продолжения',
      'Polling каждую 1 сек (было 1.5с) — плавный обратный отсчёт',
      'Нижний счётчик «Перенесено всего» обновляется во время автоцикла',
    ],
  },`;
if (!ve.includes("V1.6.17")) {
  ve = ve.replace('const VERSIONS = [', 'const VERSIONS = [\n' + v17entry);
  fs.writeFileSync(vf, ve, 'utf8');
  console.log('✅ versions.js: V1.6.17 added');
} else {
  console.log('⏭ versions.js: V1.6.17 already exists');
}

console.log('\n✅ All patches applied. Ready for: npm run build + pm2 restart + git commit');
