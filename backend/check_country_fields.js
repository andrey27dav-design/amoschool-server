// Check field mappings: multiselect/select AMO → text Kommo (e.g. country)
const mapping = require('/var/www/amoschool/backend/backups/field_mapping.json');

console.log('\n=== LEADS: AMO select/multiselect → Kommo text/textarea ===');
for (const [amoId, v] of Object.entries(mapping.leads || {})) {
  const aType = (v.amoFieldType || '').toLowerCase();
  const kType = (v.kommoFieldType || '').toLowerCase();
  if ((aType === 'select' || aType === 'multiselect') && (kType === 'text' || kType === 'textarea')) {
    console.log(`  AMO#${amoId} → Kommo#${v.kommoFieldId}: amoType=${aType}, kommoType=${kType}, name="${v.amoFieldName}"`);
  }
}

console.log('\n=== LEADS: AMO multiselect → Kommo select ===');
for (const [amoId, v] of Object.entries(mapping.leads || {})) {
  const aType = (v.amoFieldType || '').toLowerCase();
  const kType = (v.kommoFieldType || '').toLowerCase();
  if (aType === 'multiselect' && kType === 'select') {
    console.log(`  AMO#${amoId} → Kommo#${v.kommoFieldId}: enumMap keys=${Object.keys(v.enumMap || {}).length}, name="${v.amoFieldName}"`);
  }
}

console.log('\n=== CONTACTS: AMO select/multiselect → Kommo text/textarea ===');
for (const [amoId, v] of Object.entries(mapping.contacts || {})) {
  const aType = (v.amoFieldType || '').toLowerCase();
  const kType = (v.kommoFieldType || '').toLowerCase();
  if ((aType === 'select' || aType === 'multiselect') && (kType === 'text' || kType === 'textarea')) {
    console.log(`  AMO#${amoId} → Kommo#${v.kommoFieldId}: amoType=${aType}, kommoType=${kType}, name="${v.amoFieldName}"`);
  }
}

// Also find any fields where kommoFieldType is null/undefined but amoFieldType is select
console.log('\n=== LEADS: AMO select/multiselect with NO kommoFieldType set ===');
for (const [amoId, v] of Object.entries(mapping.leads || {})) {
  const aType = (v.amoFieldType || '').toLowerCase();
  if ((aType === 'select' || aType === 'multiselect') && !v.kommoFieldType) {
    console.log(`  AMO#${amoId} → Kommo#${v.kommoFieldId}: amoType=${aType}, kommoType=MISSING, name="${v.amoFieldName}"`);
  }
}
