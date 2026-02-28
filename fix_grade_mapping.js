const fs = require('fs');
const FILE = '/var/www/amoschool/backend/backups/field_mapping.json';

const mapping = JSON.parse(fs.readFileSync(FILE, 'utf8'));

if (!mapping.leads) mapping.leads = {};

// AMO 698898 "Оценка после пробного" (text) → Kommo 871446 "Grade recived after demo" (text)
mapping.leads['698898'] = {
  kommoFieldId: 871446,
  amoFieldName: 'Оценка после пробного',
  kommoFieldName: 'Grade recived after demo',
  amoFieldType: 'text',
  kommoFieldType: 'text',
  transferMode: 'direct',
  enumMap: {}
};

fs.writeFileSync(FILE, JSON.stringify(mapping, null, 2), 'utf8');
console.log('OK — маппинг добавлен: AMO 698898 → Kommo 871446');
console.log(JSON.stringify(mapping.leads['698898'], null, 2));
