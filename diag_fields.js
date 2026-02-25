#!/usr/bin/env node
// diag_fields.js - запрашивает fields-analysis и ищет проблемы
const http = require('http');

http.get('http://localhost:3001/api/migration/fields-analysis', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const j = JSON.parse(data);
    console.log('=== SUMMARY ===');
    console.log(JSON.stringify(j.summary, null, 2));

    // Ищем все поля со статусом synced
    console.log('\n=== SYNCED FIELDS ===');
    for (const [entity, edata] of Object.entries(j.entities || {})) {
      for (const group of edata.groups || []) {
        for (const field of group.fields || []) {
          if (field.status === 'synced') {
            console.log(`[${entity}] group="${group.name}" field="${field.amo.name}" (id=${field.amo.id}) kommoId=${field.kommoFieldId}`);
          }
        }
      }
    }

    // Ищем поле "Роль" / "role"
    console.log('\n=== FIELD "РОЛЬ" ===');
    for (const [entity, edata] of Object.entries(j.entities || {})) {
      for (const group of edata.groups || []) {
        for (const field of group.fields || []) {
          if ((field.amo.name || '').toLowerCase().includes('роль') || (field.amo.name || '').toLowerCase() === 'role') {
            const amoEnums = (field.amo.enums || []).map(e => e.value);
            const kommoEnums = (field.kommo?.enums || []).map(e => e.value);
            console.log(`[${entity}] group="${group.name}" field="${field.amo.name}" status="${field.status}"`);
            console.log(`  AMO enums (${amoEnums.length}): ${JSON.stringify(amoEnums)}`);
            console.log(`  Kommo enums (${kommoEnums.length}): ${JSON.stringify(kommoEnums)}`);
            console.log(`  differences: ${JSON.stringify(field.differences)}`);
            console.log(`  missingEnums: ${JSON.stringify(field.missingEnums || [])}`);
            console.log(`  matchedVia: ${field.matchedVia}`);
          }
        }
      }
    }

    // Считаем общее кол-во полей по группам
    console.log('\n=== TOTAL COUNT BY ENTITY ===');
    for (const [entity, edata] of Object.entries(j.entities || {})) {
      let total = 0;
      for (const group of edata.groups || []) {
        total += group.fields.length;
      }
      console.log(`${entity}: ${total} fields, ${edata.groups.length} groups`);
    }
  });
}).on('error', e => console.error('ERROR:', e.message));
