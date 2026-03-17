// Check mapping and transformation for contact field 918711
const path = require('path');
const fieldMapping = require('/var/www/amoschool/backend/backups/field_mapping.json');
const { transformContact } = require('/var/www/amoschool/backend/src/utils/dataTransformer');
const cache = require('/var/www/amoschool/backend/backups/amo_data_cache.json');

// Find contact 32191201
const contact = cache.contacts.find(c => c.id === 32191201);
if (!contact) { console.log('Contact not found'); process.exit(1); }

// Find field mapping entry for kommoFieldId=918711
const contacts = fieldMapping.contacts;
const entry = Object.entries(contacts).find(([k, v]) => v.kommoFieldId === 918711);
console.log('Field mapping entry:', JSON.stringify(entry, null, 2));

// Find raw field in contact
const rawField = (contact.custom_fields_values || []).find(f => f.field_id === parseInt(entry && entry[0]));
console.log('\nRaw AMO field:', JSON.stringify(rawField, null, 2));

// Transform contact and check custom fields
const transformed = transformContact(contact, fieldMapping.contacts);
const cf = (transformed.custom_fields_values || []).find(f => f.field_id === 918711);
console.log('\nTransformed field 918711:', JSON.stringify(cf, null, 2));
