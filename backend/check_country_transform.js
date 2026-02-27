// Verify actual data transformation for country + multiselect→select fields
const cache = require('/var/www/amoschool/backend/backups/amo_data_cache.json');
const mapping = require('/var/www/amoschool/backend/backups/field_mapping.json');
const { transformLead } = require('/var/www/amoschool/backend/src/utils/dataTransformer');

const lead = cache.leads.find(l => l.id === 31635363);
if (!lead) { console.log('Lead not found'); process.exit(1); }

// Check raw values for these specific fields
const fieldsToCheck = [
  { amoId: 709781, kommoId: 871438, name: 'Страна проживания (select→text)' },
  { amoId: 703925, kommoId: 871436, name: 'Предмет (multiselect→select)' },
  { amoId: 706695, kommoId: 918713, name: 'Причина закрытия (multiselect→select)' },
  { amoId: 734768, kommoId: 918715, name: 'Продукт (multiselect→select)' },
];

const stageMapping = {};
const tLead = transformLead(lead, stageMapping, mapping.leads);

for (const { amoId, kommoId, name } of fieldsToCheck) {
  const raw = (lead.custom_fields_values || []).find(f => f.field_id === amoId);
  const transformed = (tLead.custom_fields_values || []).find(f => f.field_id === kommoId);
  console.log(`\n--- ${name} ---`);
  console.log('  Raw AMO:      ', JSON.stringify(raw ? raw.values : 'NOT FOUND'));
  console.log('  Transformed:  ', JSON.stringify(transformed ? transformed.values : 'NOT FOUND / SKIPPED'));
}
