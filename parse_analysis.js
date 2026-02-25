#!/usr/bin/env node
// parse_analysis.js - парсит сохранённый ответ fields-analysis
const fs = require('fs');
const data = fs.readFileSync('/tmp/api_out.json', 'utf8');
const j = JSON.parse(data);

console.log('=== SUMMARY ===');
console.log(JSON.stringify(j.summary, null, 2));

// Ищем все поля со статусом synced
console.log('\n=== SYNCED FIELDS ===');
for (const [entity, edata] of Object.entries(j.entities || {})) {
  for (const group of edata.groups || []) {
    for (const field of group.fields || []) {
      if (field.status === 'synced') {
        console.log(`[${entity}] group="${group.name}" field="${field.amo.name}" amoId=${field.amo.id} kommoId=${field.kommoFieldId} matchedVia=${field.matchedVia}`);
      }
    }
  }
}

// Ищем поле "Роль"
console.log('\n=== FIELD "РОЛЬ" ===');
for (const [entity, edata] of Object.entries(j.entities || {})) {
  for (const group of edata.groups || []) {
    for (const field of group.fields || []) {
      const nm = (field.amo.name || '').toLowerCase();
      if (nm.includes('роль') || nm === 'role') {
        const amoEnums = (field.amo.enums || []).map(e => e.value);
        const kommoEnums = (field.kommo?.enums || []).map(e => e.value);
        console.log(`[${entity}] group="${group.name}" name="${field.amo.name}" status="${field.status}"`);
        console.log(`  AMO enums (${amoEnums.length}): ${JSON.stringify(amoEnums)}`);
        console.log(`  Kommo enums (${kommoEnums.length}): ${JSON.stringify(kommoEnums)}`);
        console.log(`  differences: ${JSON.stringify(field.differences)}`);
        console.log(`  missingEnums: ${JSON.stringify((field.missingEnums||[]).map(e=>e.value))}`);
        console.log(`  matchedVia: ${field.matchedVia}, kommoFieldId: ${field.kommoFieldId}`);
      }
    }
  }
}

// Статистика по сущностям
console.log('\n=== COUNT BY ENTITY ===');
let grandTotal = 0;
for (const [entity, edata] of Object.entries(j.entities || {})) {
  let total = 0;
  const bySt = {};
  for (const group of edata.groups || []) {
    for (const f of group.fields || []) {
      total++;
      bySt[f.status] = (bySt[f.status]||0)+1;
    }
  }
  grandTotal += total;
  console.log(`${entity}: ${total} total`, JSON.stringify(bySt));
}
console.log(`GRAND TOTAL: ${grandTotal}`);
