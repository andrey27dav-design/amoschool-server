// deep_check.js - детальная проверка задач/заметок AMO vs Kommo
const fs = require('fs-extra');
const idx = fs.readJsonSync('/var/www/amoschool/backend/backups/migration_index.json');
const cache = fs.readJsonSync('/var/www/amoschool/backend/backups/amo_data_cache.json');

// === СДЕЛКА 28405705 (AMO) → 18330165 (Kommo) ===
console.log('=== AMO TASKS for lead 28405705 (все в кэше) ===');
const allTasks = cache.leadTasks || [];
const tasks28 = allTasks
  .filter(t => Number(t.entity_id) === 28405705)
  .sort((a, b) => (b.complete_till || 0) - (a.complete_till || 0));

tasks28.forEach(t => {
  const inIndex = (idx.tasks_leads || {})[t.id];
  const dt = t.complete_till ? new Date(t.complete_till * 1000).toISOString().slice(0, 10) : 'nodate';
  console.log(`  Task AMO#${t.id} | due: ${dt} | is_completed: ${t.is_completed} | text: "${(t.text||'').substring(0,60)}" | in_index: ${!!inIndex} | kommo: ${inIndex||'---'}`);
});

console.log('\n=== AMO TASKS for lead 25630433 (все в кэше) ===');
const tasks25 = allTasks
  .filter(t => Number(t.entity_id) === 25630433)
  .sort((a, b) => (b.complete_till || 0) - (a.complete_till || 0));

tasks25.forEach(t => {
  const inIndex = (idx.tasks_leads || {})[t.id];
  const dt = t.complete_till ? new Date(t.complete_till * 1000).toISOString().slice(0, 10) : 'nodate';
  console.log(`  Task AMO#${t.id} | due: ${dt} | is_completed: ${t.is_completed} | text: "${(t.text||'').substring(0,60)}" | in_index: ${!!inIndex} | kommo: ${inIndex||'---'}`);
});

// Проверить связь задач/заметок в migration_index с правильным Kommo lead
console.log('\n=== ПРОВЕРКА: задачи AMO#25630433 привязаны к КАКОМУ Kommo лиду? ===');
console.log('(задачи зарегистрированы как перенесённые, но куда?)');
console.log('Kommo task IDs для 25630433 из индекса:');
tasks25.forEach(t => {
  const kommoId = (idx.tasks_leads || {})[t.id];
  if (kommoId) console.log(`  AMO task ${t.id} → Kommo task ${kommoId}`);
});
console.log('(Нужно проверить: эти задачи в Kommo привязаны к лиду 18330163 или к 18309097?)');

// Дата создания кэша
const cacheDate = cache._cacheDate || cache._builtAt || 'unknown';
console.log(`\nCache built at: ${cacheDate}`);
const cacheKeys = Object.keys(cache).filter(k => !k.startsWith('_'));
console.log('Cache keys:', cacheKeys);
