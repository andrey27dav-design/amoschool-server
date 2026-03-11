const fs = require('fs');

const ff = '/var/www/amoschool/frontend/src/App.jsx';
let fe = fs.readFileSync(ff, 'utf8');
let fixes = 0;

// FIX: Sync batchStats from d.stats BEFORE setBatchStatusData
// This ensures counter and status message appear simultaneously
const old1 = `        prevBatchStatusRef.current = d.status;
        setBatchStatusData(d);
        if (d.status === 'auto-waiting' || d.status === 'completed' || d.status === 'idle' || d.status === 'auto-stopped') {
          api.getBatchStats().then(setBatchStats).catch(() => {});
        }`;
const new1 = `        prevBatchStatusRef.current = d.status;
        // Instant counter sync from embedded stats — updates BEFORE status render
        if (d.stats) {
          setBatchStats(prev => ({ ...(prev || {}), ...d.stats }));
        }
        setBatchStatusData(d);
        if (d.status === 'auto-waiting' || d.status === 'completed' || d.status === 'idle' || d.status === 'auto-stopped') {
          api.getBatchStats().then(setBatchStats).catch(() => {});
        }`;
if (fe.includes(old1)) {
  fe = fe.replace(old1, new1);
  fixes++;
  console.log('✅ FIX: Stats synced from d.stats BEFORE setBatchStatusData');
} else {
  console.log('❌ FIX not found');
}

fs.writeFileSync(ff, fe, 'utf8');
console.log('Frontend: ' + fixes + ' fix(es). Lines: ' + fe.split('\n').length);

// Update versions.js
const vf = '/var/www/amoschool/backend/src/versions.js';
let ve = fs.readFileSync(vf, 'utf8');

const old_v = `    version: 'V1.6.17',
    date: '2026-03-09',
    title: 'Исправление кнопки Стоп',
    changes: [
      'Стоп корректно останавливает автоцикл — флаги сбрасываются, ручной запуск не зависает',
      'Двойной клик на Стоп не вызывает ошибку',
      'После Стоп: сообщение с количеством перенесённых и инструкцией продолжения',
      'Polling каждую 1 сек (было 1.5с) — плавный обратный отсчёт',
      'Нижний счётчик «Перенесено всего» обновляется во время автоцикла',
    ],`;
const new_v = `    version: 'V1.6.17',
    date: '2026-03-09',
    title: 'Исправление кнопки Стоп + мгновенный счётчик',
    changes: [
      'Стоп корректно останавливает автоцикл — флаги сбрасываются, ручной запуск не зависает',
      'Двойной клик на Стоп не вызывает ошибку',
      'После Стоп: сообщение с количеством перенесённых и инструкцией продолжения',
      'Polling каждую 1 сек (было 1.5с) — плавный обратный отсчёт',
      'Счётчик «Перенесено» обновляется мгновенно при завершении пакета (синхронно со статусом)',
    ],`;
if (ve.includes(old_v)) {
  ve = ve.replace(old_v, new_v);
  fs.writeFileSync(vf, ve, 'utf8');
  console.log('✅ versions.js updated');
} else {
  console.log('⏭ versions.js: entry not found or already updated');
}

console.log('\nDone. Build + pm2 restart + commit needed.');
