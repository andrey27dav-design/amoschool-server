// find_position.js — найти позицию сделки 27212311 в очереди eligible
const fse = require('fs-extra');

const CACHE  = '/var/www/amoschool/backend/backups/amo_data_cache.json';
const IDX    = '/var/www/amoschool/backend/backups/migration_index.json';
const BCFG   = '/var/www/amoschool/backend/backups/batch_config.json';

const cache  = fse.readJsonSync(CACHE);
const idx    = fse.readJsonSync(IDX);
const bcfg   = fse.readJsonSync(BCFG);

const LEAD_ID = 27212311;

// Воспроизводим логику getEligibleLeads из batchMigrationService
const allLeads   = cache.leads || [];
const migratedIds = new Set(Object.keys(idx.leads || {}).map(Number));
const managerIds  = (bcfg.managerIds || []).map(Number);

// Фильтр по менеджерам (если задан)
let eligible = allLeads;
if (managerIds.length > 0) {
  const mSet = new Set(managerIds);
  eligible = allLeads.filter(l => mSet.has(l.responsible_user_id));
}

// Убираем уже перенесённые
const notMigrated = eligible.filter(l => !migratedIds.has(l.id));

console.log(`Всего в кэше: ${allLeads.length}`);
console.log(`Eligible (по менеджерам): ${eligible.length}`);
console.log(`Не перенесено (eligible): ${notMigrated.length}`);
console.log(`batch_config: offset=${bcfg.offset}, batchSize=${bcfg.batchSize}, managerIds=${JSON.stringify(bcfg.managerIds)}`);

const pos = notMigrated.findIndex(l => l.id === LEAD_ID);
if (pos === -1) {
  console.log(`\n❌ Сделка ${LEAD_ID} НЕ найдена в очереди eligible!`);
  const inEligible = eligible.find(l => l.id === LEAD_ID);
  const inAll      = allLeads.find(l => l.id === LEAD_ID);
  console.log(`  В eligible (с уже перенесёнными): ${inEligible ? 'да' : 'нет'}`);
  console.log(`  В кэше вообще: ${inAll ? 'да' : 'нет'}`);
  if (migratedIds.has(LEAD_ID)) console.log(`  ⚠️ Уже перенесена! Есть в migration_index.`);
} else {
  console.log(`\n✅ Позиция сделки ${LEAD_ID} в очереди: ${pos} (0-based)`);
  console.log(`   Нужно выставить: offset=${pos}, batchSize=1`);
  // Показать соседей
  console.log(`\nСоседи в очереди:`);
  for (let i = Math.max(0, pos-1); i <= Math.min(notMigrated.length-1, pos+1); i++) {
    const l = notMigrated[i];
    console.log(`  [${i}] #${l.id} "${l.name}" ${i === pos ? '← НАША' : ''}`);
  }
}
