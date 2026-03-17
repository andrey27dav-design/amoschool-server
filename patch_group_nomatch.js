#!/usr/bin/env node
// patch_group_nomatch.js
// Если AMO-группа не имеет аналога в Kommo — поля этой группы
// не матчатся по коду/имени/кросс-яз. (только по сохранённому маппингу).

const fs = require('fs');
const path = '/var/www/amoschool/backend/src/routes/migration.js';

let raw = fs.readFileSync(path, 'utf8');
const crlf = raw.includes('\r\n');
let src = crlf ? raw.replace(/\r\n/g, '\n') : raw;

let ok = 0;

// ─── Патч 1: после построения kGroupByName добавляем вычисление amoGroupsWithNoKommo ───
const P1_OLD = `      // Индексируем Kommo-группы по name
      const kGroupByName = {};
      kommoGroups.forEach(g => { kGroupByName[(g.name || '').toLowerCase().trim()] = g; });`;

const P1_NEW = `      // Индексируем Kommo-группы по name
      const kGroupByName = {};
      kommoGroups.forEach(g => { kGroupByName[(g.name || '').toLowerCase().trim()] = g; });

      // AMO-группы, у которых нет аналога в Kommo (нет группы с таким именем/псевдонимом).
      // Поля таких групп не матчатся автоматически — только после подтверждения оператором.
      const amoGroupsWithNoKommo = new Set();
      amoGroups.forEach(g => {
        const n = (g.name || '').toLowerCase().trim();
        const mapped = AMO_KOMMO_GROUP_NAME_MAP[n] || n;
        if (!kGroupByName[mapped] && !kGroupByName[n]) amoGroupsWithNoKommo.add(g.id);
      });`;

if (src.includes(P1_OLD)) {
  src = src.replace(P1_OLD, P1_NEW);
  console.log('OK 1: amoGroupsWithNoKommo добавлен');
  ok++;
} else {
  console.log('FAIL 1: не найден блок kGroupByName');
}

// ─── Патч 2: в Проходе 1 — 1a и 1b проверяют groupHasNoKommo ───
const P2_OLD = `        let kf = null, via = null;
        // 1a. По code
        if (af.code) {
          const cand = kByCode[af.code.toUpperCase()];
          if (cand && !usedKommoIds.has(cand.id)) { kf = cand; via = 'code'; }
        }
        // 1b. По name (точное совпадение, case-insensitive)
        if (!kf) {
          const cand = kByName[(af.name || '').toLowerCase().trim()];
          if (cand && !usedKommoIds.has(cand.id)) { kf = cand; via = 'name'; }
        }
        // 1c. По сохранённому маппингу (ранее созданные поля)`;

const P2_NEW = `        let kf = null, via = null;
        // Поля из AMO-групп без аналога в Kommo не матчатся по коду/имени.
        // Матчинг разрешён только по сохранённому маппингу (уже подтверждено оператором).
        const groupHasNoKommo = !!(af.group_id && amoGroupsWithNoKommo.has(af.group_id));

        // 1a. По code
        if (!groupHasNoKommo && af.code) {
          const cand = kByCode[af.code.toUpperCase()];
          if (cand && !usedKommoIds.has(cand.id)) { kf = cand; via = 'code'; }
        }
        // 1b. По name (точное совпадение, case-insensitive)
        if (!groupHasNoKommo && !kf) {
          const cand = kByName[(af.name || '').toLowerCase().trim()];
          if (cand && !usedKommoIds.has(cand.id)) { kf = cand; via = 'name'; }
        }
        // 1c. По сохранённому маппингу (ранее созданные поля) — разрешён всегда`;

if (src.includes(P2_OLD)) {
  src = src.replace(P2_OLD, P2_NEW);
  console.log('OK 2: Pass 1 (code/name) guard добавлен');
  ok++;
} else {
  console.log('FAIL 2: не найден блок Pass 1 code/name');
}

// ─── Патч 3: в Проходе 2 (кросс-языковой) — пропускаем поля из групп без аналога в Kommo ───
const P3_OLD = `      allAmoFields.forEach(af => {
        if (skippedIds[entity + '_' + af.id]) return;
        if (matchMap[af.id]) return; // уже найдено надёжным способом

        const clm = findCrossLangMatch(af, availableKommoFields);`;

const P3_NEW = `      allAmoFields.forEach(af => {
        if (skippedIds[entity + '_' + af.id]) return;
        if (matchMap[af.id]) return; // уже найдено надёжным способом
        // Группы без аналога в Kommo — кросс-языковой матчинг не применяем
        if (af.group_id && amoGroupsWithNoKommo.has(af.group_id)) return;

        const clm = findCrossLangMatch(af, availableKommoFields);`;

if (src.includes(P3_OLD)) {
  src = src.replace(P3_OLD, P3_NEW);
  console.log('OK 3: Pass 2 (cross-lang) guard добавлен');
  ok++;
} else {
  console.log('FAIL 3: не найден блок Pass 2 cross-lang');
}

if (ok === 3) {
  const out = crlf ? src.replace(/\n/g, '\r\n') : src;
  fs.writeFileSync(path, out, 'utf8');
  console.log(`\nВсе ${ok}/3 патча применены, файл сохранён.`);
} else {
  console.log(`\nПрименено ${ok}/3. Файл НЕ сохранён.`);
  process.exit(1);
}
