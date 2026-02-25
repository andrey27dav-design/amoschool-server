#!/usr/bin/env node
// parse_detail.js - детальный разбор partial полей и "Роль"
const fs = require('fs');
const data = fs.readFileSync('/tmp/api_out.json', 'utf8');
const j = JSON.parse(data);

// Все partial поля
console.log('\n=== ALL PARTIAL FIELDS (detail) ===');
for (const [entity, edata] of Object.entries(j.entities || {})) {
  for (const group of edata.groups || []) {
    for (const field of group.fields || []) {
      if (field.status === 'partial') {
        const amoEnums = (field.amo.enums || []).map(e => e.value);
        const kommoEnums = (field.kommo?.enums || []).map(e => e.value);
        console.log(`\n[${entity}] group="${group.name}" name="${field.amo.name}" (amoId=${field.amo.id})`);
        console.log(`  AMO enums (${amoEnums.length}): ${JSON.stringify(amoEnums)}`);
        console.log(`  Kommo enums (${kommoEnums.length}): ${JSON.stringify(kommoEnums)}`);
        console.log(`  missingEnums (не хватает в Kommo): ${JSON.stringify((field.missingEnums||[]).map(e=>e.value))}`);
        console.log(`  matchedVia: ${field.matchedVia}`);
      }
    }
  }
}

// "Роль" подробно с проверкой каждого значения
console.log('\n=== "РОЛЬ" ENUM BY ENUM CHECK ===');
// Clusters from the aliases in the code
const CLUSTERS = [
  ['мама', 'мать', 'mother', 'mom'],
  ['папа', 'отец', 'father', 'dad'],
  ['бабушка', 'grandmother', 'grandma'],
  ['дедушка', 'grandfather', 'grandpa'],
  ['няня', 'nanny', 'babysitter'],
  ['опекун', 'guardian'],
  ['ребенок', 'ребёнок', 'child', 'student himself', 'kid', 'сам ученик', 'infant'],
];

function norm(v) {
  return (v||'').toLowerCase().replace(/[,;.()\[\]\/#!?«»"'`]/g,' ').replace(/\s+/g,' ').trim();
}

const amoEnums = ["Мама","Папа","Бабушка","Дедушка","Ребенок","Няня"];
const kommoEnums = ["Father","Mother","Grandfather","Grandmother","Nanny","Guardian","Student himself"];

console.log('AMO → Kommo mapping:');
for (const av of amoEnums) {
  const an = norm(av);
  let matched = null;
  for (const kv of kommoEnums) {
    const kn = norm(kv);
    // same cluster?
    for (const cl of CLUSTERS) {
      if (cl.includes(an) && cl.includes(kn)) { matched = kv; break; }
    }
    if (matched) break;
  }
  console.log(`  AMO "${av}" → Kommo "${matched || 'НЕТ СОВПАДЕНИЯ'}" `);
}

console.log('\nKommo values without AMO match (extra in Kommo):');
for (const kv of kommoEnums) {
  const kn = norm(kv);
  let hasAmoMatch = false;
  for (const av of amoEnums) {
    const an = norm(av);
    for (const cl of CLUSTERS) {
      if (cl.includes(an) && cl.includes(kn)) { hasAmoMatch = true; break; }
    }
    if (hasAmoMatch) break;
  }
  if (!hasAmoMatch) console.log(`  Kommo "${kv}" — нет в AMO`);
}

// Показать поля matched со снятием только числа варантов 
console.log('\n=== MATCHED ENUM FIELDS (count mismatch check) ===');
for (const [entity, edata] of Object.entries(j.entities || {})) {
  for (const group of edata.groups || []) {
    for (const field of group.fields || []) {
      if (field.status === 'matched') {
        const aEn = field.amo.enums || [];
        const kEn = field.kommo?.enums || [];
        if (aEn.length > 0 || kEn.length > 0) {
          const mismatch = aEn.length !== kEn.length ? ' ← COUNT MISMATCH' : '';
          console.log(`[${entity}] "${field.amo.name}" AMO=${aEn.length} Kommo=${kEn.length}${mismatch}`);
        }
      }
    }
  }
}
