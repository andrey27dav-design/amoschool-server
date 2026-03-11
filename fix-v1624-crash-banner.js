// V1.6.24: Auto-dismiss crash banner when normal operation resumes
// Problem: "Сервер перезагрузился" banner stays visible even after user continues migration
// Fix: Clear crashDetected when status transitions to 'running' or 'auto-waiting'

const fs = require('fs');
const appPath = '/var/www/amoschool/frontend/src/App.jsx';
let app = fs.readFileSync(appPath, 'utf8');
const orig = app;

// 1. In the polling useEffect, when we get status 'running' — clear crash banner
// Find where prevBatchStatusRef is set in the running poll
app = app.replace(
  `          prevBatchStatusRef.current = d.status;
          // Sync counters instantly from embedded stats`,
  `          prevBatchStatusRef.current = d.status;
          // Auto-dismiss crash banner when normal operation resumes
          if (d.status === 'running' || d.status === 'auto-waiting') {
            setCrashDetected(false);
          }
          // Sync counters instantly from embedded stats`
);

// 2. Also clear when handleStartBatch / handleResumeBatch / handleStartAutoRun succeed
// handleStartAutoRun already exists, add crashDetected reset
app = app.replace(
  `    continueSignalSentRef.current = false;
    setLastBatchResult(null); // clear previous results for fresh start
    if (batchSize === 0 || !batchSize) {`,
  `    continueSignalSentRef.current = false;
    setCrashDetected(false);
    setLastBatchResult(null); // clear previous results for fresh start
    if (batchSize === 0 || !batchSize) {`
);

if (app === orig) {
  console.error('ERROR: No changes made!');
  process.exit(1);
}

fs.writeFileSync(appPath, app, 'utf8');
console.log('OK: crash banner auto-dismisses on resume');

// Update versions
const versionsPath = '/var/www/amoschool/backend/src/versions.js';
let versions = fs.readFileSync(versionsPath, 'utf8');
versions = versions.replace(
  "const VERSIONS = [\n  {",
  `const VERSIONS = [
  {
    version: 'V1.6.24',
    date: '2026-03-09',
    title: 'Баннер перезагрузки автоматически скрывается',
    changes: [
      'Сообщение «Сервер перезагрузился» скрывается автоматически при возобновлении работы',
      'Нет необходимости вручную закрывать баннер — он пропадает когда миграция продолжается',
    ],
  },
  {`
);
fs.writeFileSync(versionsPath, versions, 'utf8');
console.log('OK: V1.6.24 version added');
