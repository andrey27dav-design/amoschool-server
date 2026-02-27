const m = require('/var/www/amoschool/backend/backups/field_mapping.json');
// Find Kommo field 918355
const e = Object.entries(m.leads).find(([k, v]) => v.kommoFieldId === 918355);
console.log('Field 918355:', JSON.stringify(e, null, 2));
// Also show all fields where amoFieldType=checkbox but kommoFieldType != checkbox 
const mismatches = Object.entries(m.leads).filter(([k, v]) =>
  v.amoFieldType === 'checkbox' && v.kommoFieldType !== 'checkbox'
);
console.log('\nCheckbox mismatches (amo=checkbox, kommo!=checkbox):', mismatches.length);
mismatches.forEach(([k, v]) => console.log(`  AMO#${k} → Kommo#${v.kommoFieldId}: amoType=${v.amoFieldType} kommoType=${v.kommoFieldType}`));
// Same for contacts
const cm = Object.entries(m.contacts || {}).filter(([k, v]) =>
  v.amoFieldType === 'checkbox' && v.kommoFieldType !== 'checkbox'
);
console.log('\nContact checkbox mismatches:', cm.length);
cm.forEach(([k, v]) => console.log(`  AMO#${k} → Kommo#${v.kommoFieldId}: amoType=${v.amoFieldType} kommoType=${v.kommoFieldType}`));
