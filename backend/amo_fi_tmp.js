const axios = require('axios');
const fs = require('fs');
require('dotenv').config({ path: '/var/www/amoschool/backend/.env' });

const amoClient = axios.create({
  baseURL: 'https://houch.amocrm.ru',
  headers: { Authorization: 'Bearer ' + process.env.AMO_TOKEN }
});

async function fetchAll(url) {
  let all = [], page = 1;
  while (true) {
    const r = await amoClient.get(url + '?limit=250&page=' + page).catch(() => null);
    if (!r || !r.data || !r.data._embedded) break;
    const items = r.data._embedded.custom_fields || [];
    all = all.concat(items);
    if (items.length < 250) break;
    page++;
  }
  return all;
}

async function main() {
  const [leads, contacts, companies] = await Promise.all([
    fetchAll('/api/v4/leads/custom_fields'),
    fetchAll('/api/v4/contacts/custom_fields'),
    fetchAll('/api/v4/companies/custom_fields'),
  ]);

  const data = { leads, contacts, companies };
  fs.writeFileSync('/tmp/amo_fields_full.json', JSON.stringify(data, null, 2));

  // Stats per entity
  for (const [name, fields] of Object.entries(data)) {
    const apiOnly    = fields.filter(f => f.is_api_only === true).length;
    const visible    = fields.filter(f => f.is_api_only === false).length;
    const groups     = [...new Set(fields.map(f => f.group_id))];
    const hiddenAny  = fields.filter(f => f.hidden_statuses && f.hidden_statuses.length > 0).length;

    console.log(`\n=== ${name.toUpperCase()} (${fields.length} fields) ===`);
    console.log(`  is_api_only=true:  ${apiOnly} (hidden from managers)`);
    console.log(`  is_api_only=false: ${visible} (visible in card)`);
    console.log(`  hidden_statuses>0: ${hiddenAny} (hidden on some stages)`);
    console.log(`  group_ids: ${JSON.stringify(groups)}`);
  }

  // Param overview from first field
  console.log('\n=== ALL PARAMS IN A FIELD ===');
  console.log(Object.keys(leads[0]));

  // Show breakdown: api_only fields list for leads
  console.log('\n=== LEADS: is_api_only=true fields ===');
  leads.filter(f => f.is_api_only).forEach(f =>
    console.log(`  ${f.id} | ${f.name} | ${f.code || '—'} | ${f.type} | group:${f.group_id}`)
  );

  console.log('\n=== LEADS: is_api_only=false fields (visible) ===');
  leads.filter(f => !f.is_api_only).forEach(f =>
    console.log(`  ${f.id} | ${f.name} | ${f.code || '—'} | ${f.type} | group:${f.group_id} | sort:${f.sort}`)
  );

  console.log('\n=== CONTACTS: is_api_only=true fields ===');
  contacts.filter(f => f.is_api_only).forEach(f =>
    console.log(`  ${f.id} | ${f.name} | ${f.code || '—'} | ${f.type}`)
  );

  console.log('\n=== CONTACTS: is_api_only=false fields (visible) ===');
  contacts.filter(f => !f.is_api_only).forEach(f =>
    console.log(`  ${f.id} | ${f.name} | ${f.code || '—'} | ${f.type}`)
  );

  console.log('\n=== COMPANIES: all fields ===');
  companies.forEach(f =>
    console.log(`  ${f.id} | ${f.name} | is_api_only:${f.is_api_only} | ${f.type}`)
  );

  console.log('\nSaved to /tmp/amo_fields_full.json');
}

main().catch(e => console.error(e.response ? JSON.stringify(e.response.data) : e.message));
