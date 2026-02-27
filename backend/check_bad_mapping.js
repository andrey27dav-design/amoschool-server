const m = require('/var/www/amoschool/backend/backups/field_mapping.json');
// Find lead fields where kommoFieldId = 918715 or 871436
Object.entries(m.leads || {}).forEach(([amoId, v]) => {
  if (v.kommoFieldId === 918715 || v.kommoFieldId === 871436) {
    console.log('AMO field', amoId, '→', JSON.stringify(v, null, 2));
  }
});
// Also show all lead fields where fieldType is select/radiobutton/multiselect and enumMap is empty
console.log('\n--- select/radiobutton/multiselect with EMPTY enumMap ---');
Object.entries(m.leads || {}).forEach(([amoId, v]) => {
  if (['select','radiobutton','multiselect'].includes(v.fieldType) && Object.keys(v.enumMap||{}).length === 0) {
    console.log('AMO', amoId, 'kommoId', v.kommoFieldId, 'type', v.fieldType, 'name', v.amoFieldName);
  }
});
console.log('\n--- contacts ---');
Object.entries(m.contacts || {}).forEach(([amoId, v]) => {
  if (['select','radiobutton','multiselect'].includes(v.fieldType) && Object.keys(v.enumMap||{}).length === 0) {
    console.log('AMO', amoId, 'kommoId', v.kommoFieldId, 'type', v.fieldType, 'name', v.amoFieldName);
  }
});
