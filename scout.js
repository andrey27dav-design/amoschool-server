'use strict';
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.resolve(__dirname, '../backend/.env'), 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const m = line.match(/^([A-Z_0-9]+)\s*=\s*(.+)$/);
  if (m) env[m[1]] = m[2].trim();
});

const AMO_TOKEN   = env.AMO_TOKEN;
const KOMMO_TOKEN = env.KOMMO_TOKEN;
const AMO_BASE    = env.AMO_BASE_URL;
const KOMMO_BASE  = env.KOMMO_BASE_URL;
const DEAL_ID     = 31635363;

const amo = axios.create({
  baseURL: AMO_BASE,
  headers: { Authorization: 'Bearer ' + AMO_TOKEN, 'Content-Type': 'application/json' },
  timeout: 30000
});
const kommo = axios.create({
  baseURL: KOMMO_BASE,
  headers: { Authorization: 'Bearer ' + KOMMO_TOKEN, 'Content-Type': 'application/json' },
  timeout: 30000
});

async function main() {
  console.log('\n=== STEP 1: Current deal state ===');
  const dealRes = await amo.get('/api/v4/leads/' + DEAL_ID + '?with=contacts,companies');
  const deal = dealRes.data;
  console.log('name:', deal.name);
  console.log('price:', deal.price);
  console.log('pipeline_id:', deal.pipeline_id);
  console.log('status_id:', deal.status_id);
  console.log('responsible_user_id:', deal.responsible_user_id);
  const cfv = deal.custom_fields_values || [];
  console.log('custom_fields count:', cfv.length);
  cfv.forEach(f => console.log('  field_id=' + f.field_id + ' [' + f.field_name + '] = ' + JSON.stringify(f.values)));
  const contacts = (deal._embedded && deal._embedded.contacts) || [];
  const companies = (deal._embedded && deal._embedded.companies) || [];
  const tags = (deal._embedded && deal._embedded.tags) || [];
  console.log('contacts:', contacts.map(c => c.id).join(',') || 'none');
  console.log('companies:', companies.map(c => c.id).join(',') || 'none');
  console.log('tags:', tags.map(t => t.name).join(', ') || 'none');

  console.log('\n=== STEP 2: AMO lead custom fields ===');
  const cfRes = await amo.get('/api/v4/leads/custom_fields?limit=250');
  const allFields = (cfRes.data._embedded && cfRes.data._embedded.custom_fields) || [];
  console.log('Total lead custom fields:', allFields.length);
  allFields.forEach(f => {
    const enums = f.enums ? ' enums=[' + f.enums.slice(0,5).map(e => e.id + ':' + e.value).join('|') + ']' : '';
    console.log('  id=' + f.id + ' type=' + f.type + ' name=' + f.name + enums);
  });

  console.log('\n=== STEP 3: AMO users ===');
  const usersRes = await amo.get('/api/v4/users');
  const amoUsers = (usersRes.data._embedded && usersRes.data._embedded.users) || [];
  amoUsers.forEach(u => console.log('  id=' + u.id + ' name=' + u.name + ' email=' + u.email));

  console.log('\n=== STEP 4: BAZA pipeline stages (id=' + deal.pipeline_id + ') ===');
  const pipeRes = await amo.get('/api/v4/leads/pipelines/' + deal.pipeline_id + '?with=statuses');
  const statuses = (pipeRes.data._embedded && pipeRes.data._embedded.statuses) || [];
  statuses.forEach(s => console.log('  id=' + s.id + ' name=' + s.name));

  console.log('\n=== STEP 5: Kommo pipelines + statuses ===');
  const kPipesRes = await kommo.get('/api/v4/leads/pipelines?with=statuses&limit=250');
  const kPipes = (kPipesRes.data._embedded && kPipesRes.data._embedded.pipelines) || [];
  kPipes.forEach(p => {
    const st = (p._embedded && p._embedded.statuses) || [];
    console.log('  PIPE id=' + p.id + ' name=' + p.name);
    st.forEach(s => console.log('    status id=' + s.id + ' name=' + s.name));
  });

  console.log('\n=== STEP 6: Kommo users ===');
  const kUsersRes = await kommo.get('/api/v4/users');
  const kUsers = (kUsersRes.data._embedded && kUsersRes.data._embedded.users) || [];
  kUsers.forEach(u => console.log('  id=' + u.id + ' name=' + u.name + ' email=' + u.email));

  console.log('\n=== STEP 7: AMO tasks on deal ===');
  const tasksRes = await amo.get('/api/v4/tasks?filter[entity_id]=' + DEAL_ID + '&filter[entity_type]=leads&limit=50');
  const tasks = (tasksRes.data._embedded && tasksRes.data._embedded.tasks) || [];
  console.log('Tasks count:', tasks.length);
  tasks.forEach(t => console.log('  id=' + t.id + ' text=' + t.text + ' due=' + t.complete_till));

  console.log('\n=== STEP 8: AMO notes on deal ===');
  const notesRes = await amo.get('/api/v4/leads/' + DEAL_ID + '/notes?limit=50');
  const notes = (notesRes.data._embedded && notesRes.data._embedded.notes) || [];
  console.log('Notes count:', notes.length);
  notes.forEach(n => console.log('  id=' + n.id + ' type=' + n.note_type + ' params=' + JSON.stringify(n.params)));

  console.log('\n=== SCOUT COMPLETE ===');
}

main().catch(e => {
  console.error('ERROR:', e.response ? JSON.stringify(e.response.data, null, 2) : e.message);
  process.exit(1);
});
