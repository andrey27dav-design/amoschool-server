#!/usr/bin/env node
// fix_mapping_and_groups.js
// 1. Удалить contacts.733989 (Venyoo город) из field_mapping.json
// 2. Исправить логику amoGroupsWithNoKommo — разрешить матчинг для известных AMO_KOMMO_GROUP_NAME_MAP групп

const fs = require('fs');

// ─── Часть 1: field_mapping.json ─────────────────────────────────────────────
const mapPath = '/var/www/amoschool/backend/backups/field_mapping.json';
const mapping = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

const before = JSON.stringify(mapping.contacts || {});
if (mapping.contacts && mapping.contacts['733989']) {
  delete mapping.contacts['733989'];
  if (Object.keys(mapping.contacts).length === 0) delete mapping.contacts;
  fs.writeFileSync(mapPath, JSON.stringify(mapping, null, 2));
  console.log('OK 1: contacts.733989 (Venyoo город) удалён из маппинга');
} else {
  console.log('SKIP 1: contacts.733989 не найден в маппинге');
}
console.log('       was:', before);
console.log('       now:', JSON.stringify(mapping.contacts || {}));

// ─── Часть 2: migration.js — исправить amoGroupsWithNoKommo ─────────────────
const routePath = '/var/www/amoschool/backend/src/routes/migration.js';
let raw = fs.readFileSync(routePath, 'utf8');
const crlf = raw.includes('\r\n');
let src = crlf ? raw.replace(/\r\n/g, '\n') : raw;

// Старая логика: блокирует группу если нет Kommo-аналога (даже если группа есть в AMO_KOMMO_GROUP_NAME_MAP)
const OLD = `      // AMO-группы, у которых нет аналога в Kommo (нет группы с таким именем/псевдонимом).
      // Поля таких групп не матчатся автоматически — только после подтверждения оператором.
      const amoGroupsWithNoKommo = new Set();
      amoGroups.forEach(g => {
        const n = (g.name || '').toLowerCase().trim();
        const mapped = AMO_KOMMO_GROUP_NAME_MAP[n] || n;
        if (!kGroupByName[mapped] && !kGroupByName[n]) amoGroupsWithNoKommo.add(g.id);
      });`;

// Новая логика: блокирует ТОЛЬКО если группа НЕ в AMO_KOMMO_GROUP_NAME_MAP (т.е. неизвестна системе)
// "Статистика" есть в AMO_KOMMO_GROUP_NAME_MAP → НЕ блокируется
// "Контроль качества", "Emfy", "GetCourse" — не известны → блокируются
const NEW = `      // AMO-группы без аналога в Kommo, для которых блокируем автоматический матчинг.
      // Блокируем только если группа: (а) НЕ в AMO_KOMMO_GROUP_NAME_MAP (не известна системе)
      //   И (б) Kommo не имеет группы с таким именем/псевдонимом.
      // Если группа есть в AMO_KOMMO_GROUP_NAME_MAP (напр. "Статистика" → "statistics") —
      // разрешаем матчинг полей, даже если Kommo-группа ещё не создана.
      const amoGroupsWithNoKommo = new Set();
      amoGroups.forEach(g => {
        const n = (g.name || '').toLowerCase().trim();
        const mapped = AMO_KOMMO_GROUP_NAME_MAP[n] || n;
        const hasKommoGroup  = !!(kGroupByName[mapped] || kGroupByName[n]);
        const isKnownMapping = !!AMO_KOMMO_GROUP_NAME_MAP[n];
        // Блокируем: нет Kommo-группы И имя группы неизвестно в карте переименований
        if (!hasKommoGroup && !isKnownMapping) amoGroupsWithNoKommo.add(g.id);
      });`;

if (src.includes(OLD)) {
  src = src.replace(OLD, NEW);
  const out = crlf ? src.replace(/\n/g, '\r\n') : src;
  fs.writeFileSync(routePath, out, 'utf8');
  console.log('OK 2: amoGroupsWithNoKommo — известные группы разблокированы');
} else {
  console.log('FAIL 2: старый блок не найден');
}
