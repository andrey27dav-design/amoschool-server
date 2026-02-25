#!/usr/bin/env node
// patch_backend_synced.js
// Патч: статус 'synced' только для подтверждённых полей (есть в entityMapping)
// 'matched' = точное совпадение без подтверждения
// Запускать на сервере: node /var/www/amoschool/patch_backend_synced.js

const fs = require('fs');
const filePath = '/var/www/amoschool/backend/src/routes/migration.js';
let src = fs.readFileSync(filePath, 'utf8');
let ok = 0;

// ── 1. compareFields: 'synced' → 'matched' + флаг exactMatch ────────────────
const old1 = `  if (diffs.length === 0) return { status: 'synced', differences: [] };
  return { status: 'matched', differences: diffs };`;
const new1 = `  // exactMatch: true — значит поля полностью идентичны.
  // Финальный статус 'synced' определяется не здесь, а в fields-analysis
  // (только если поле уже подтверждено/создано через маппинг).
  if (diffs.length === 0) return { status: 'matched', differences: [], exactMatch: true };
  return { status: 'matched', differences: diffs };`;

if (src.includes(old1)) {
  src = src.replace(old1, new1);
  console.log('OK 1: compareFields — возвращает exactMatch:true вместо synced');
  ok++;
} else {
  console.log('FAIL 1: паттерн compareFields не найден');
  console.log('  поиск:', JSON.stringify(old1.substring(0, 60)));
}

// ── 2. fields-analysis: добавить isConfirmed + finalStatus ──────────────────
const old2 = `          const cmp = compareFields(af, kf, entityMapping[af.id]);

          // Если тип не совпал — не показываем найденное Kommo-поле;
          // это поле будет создано с правильным типом (статус уже 'missing')
          const kommoDisplay = cmp.typeConflict ? null : kf;
          const effectiveVia = cmp.typeConflict ? null : via;

          summary[cmp.status]++;

          return {
            amo: af,
            kommo: kommoDisplay,
            status: cmp.status,`;
const new2 = `          const cmp = compareFields(af, kf, entityMapping[af.id]);

          // Если тип не совпал — не показываем найденное Kommo-поле;
          // это поле будет создано с правильным типом (статус уже 'missing')
          const kommoDisplay = cmp.typeConflict ? null : kf;
          const effectiveVia = cmp.typeConflict ? null : via;

          // 'synced' = поле подтверждено (есть в маппинге) + точное совпадение.
          // До подтверждения точное совпадение = 'matched'. Частичное = 'partial'.
          const isConfirmed = !!entityMapping[af.id]?.kommoFieldId;
          const finalStatus = (cmp.exactMatch && isConfirmed) ? 'synced' : cmp.status;

          summary[finalStatus]++;

          return {
            amo: af,
            kommo: kommoDisplay,
            status: finalStatus,`;

if (src.includes(old2)) {
  src = src.replace(old2, new2);
  console.log('OK 2: fields-analysis — finalStatus с проверкой isConfirmed');
  ok++;
} else {
  console.log('FAIL 2: паттерн fields-analysis не найден');
  // Диагностика
  const diagIdx = src.indexOf('summary[cmp.status]++');
  if (diagIdx >= 0) console.log('  Контекст:', JSON.stringify(src.substring(diagIdx - 100, diagIdx + 100)));
}

fs.writeFileSync(filePath, src, 'utf8');
console.log('\nГотово:', ok, '/ 2 изменений применено');
