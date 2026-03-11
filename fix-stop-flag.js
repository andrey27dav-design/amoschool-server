const fs = require('fs');
const f = '/var/www/amoschool/backend/src/services/batchMigrationService.js';
let code = fs.readFileSync(f, 'utf8');
let fixes = 0;

// FIX: Reset pauseRequestedFlag and autoRunStopFlag at the start of runBatchMigration
const oldInit = `async function runBatchMigration(stageMapping) {
  if (batchState.status === 'running') throw new Error('Пакетная миграция уже выполняется');

  loadBatchConfig();`;

const newInit = `async function runBatchMigration(stageMapping) {
  if (batchState.status === 'running') throw new Error('Пакетная миграция уже выполняется');

  // Reset flags from previous run (prevents stale stop/pause leaking into new batch)
  pauseRequestedFlag = false;
  if (!autoRunEnabled) autoRunStopFlag = false;

  loadBatchConfig();`;

if (code.includes(oldInit)) {
  code = code.replace(oldInit, newInit);
  fixes++;
  console.log('✅ FIX: Reset pause/stop flags at runBatchMigration start');
} else {
  console.log('❌ Could not find runBatchMigration init pattern');
  const idx = code.indexOf('async function runBatchMigration');
  if (idx > -1) console.log('Found at char', idx, ':', JSON.stringify(code.substring(idx, idx + 200)));
}

fs.writeFileSync(f, code, 'utf8');
console.log(`Done. ${fixes} fixes. Lines: ${code.split('\n').length}`);
