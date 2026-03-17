'use strict';
const axios = require('axios');

const AMO_TOKEN = process.env.AMO_TOKEN;
const KOMMO_TOKEN = process.env.KOMMO_TOKEN;
const AMO_BASE = process.env.AMO_BASE_URL;
const KOMMO_BASE = process.env.KOMMO_BASE_URL;
const DEAL_ID = 31635363;

const amo = axios.create({ baseURL: AMO_BASE, headers: { Authorization: 'Bearer ' + AMO_TOKEN, 'Content-Type': 'application/json' }, timeout: 30000 });
const kommo = axios.create({ baseURL: KOMMO_BASE, headers: { Authorization: 'Bearer ' + KOMMO_TOKEN, 'Content-Type': 'application/json' }, timeout: 30000 });

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== STEP 1: Get deal current state ===');
  const dealRes = await amo.get('/api/v4/leads/' + DEAL_ID + '?with=contacts,companies');
  const deal = dealRes.data;
  console.log('Deal name:', deal.name, '| pipeline_id:', deal.pipeline_id, '| status_id:', deal.status_id, '| responsible_user_id:', deal.responsible_user_id);
  console.log('Custom fields count:', (deal.custom_fields_values || []).length);

  console.log('\n=== STEP 2: Get AMO custom fields for leads ===');
  const cfRes = await amo.get('/api/v4/leads/custom_fields?limit=250');
  const allFields = cfRes.data._embedded?.custom_fields || [];
  console.log('Total lead custom fields:', allFields.length);

  // Show field list
  allFields.slice(0, 30).forEach(f => {
    console.log('  id=' + f.id + ' type=' + f.type + ' name=' + f.name);
  });

  console.log('\n=== STEP 3: Get AMO users ===');
  const usersRes = await amo.get('/api/v4/users');
  const users = usersRes.data._embedded?.users || [];
  console.log('Users:', users.map(u => u.id + ':' + u.name).join(', '));

  console.log('\n=== STEP 4: Get BAZA pipeline stages ===');
  const pipeRes = await amo.get('/api/v4/leads/pipelines/' + deal.pipeline_id + '?with=statuses');
  const statuses = pipeRes.data._embedded?.statuses || [];
  console.log('Statuses:', statuses.map(s => s.id + ':' + s.name).join(', '));

  console.log('\n=== STEP 5: Get Kommo pipelines ===');
  const kPipesRes = await kommo.get('/api/v4/leads/pipelines?with=statuses&limit=250');
  const kPipes = kPipesRes.data._embedded?.pipelines || [];
  kPipes.forEach(p => console.log('  Kommo pipeline id=' + p.id + ' name=' + p.name));
  const basePipe = kPipes.find(p => p.name && p.name.toLowerCase().includes('base'));
  console.log('Found Base pipeline:', basePipe ? basePipe.id + ':' + basePipe.name : 'NOT FOUND');
  if (basePipe) {
    const kStatuses = basePipe._embedded?.statuses || [];
    console.log('Base statuses:', kStatuses.map(s => s.id + ':' + s.name).join(', '));
  }

  console.log('\n=== STEP 6: Get Kommo users ===');
  const kUsersRes = await kommo.get('/api/v4/users');
  const kUsers = kUsersRes.data._embedded?.users || [];
  console.log('Kommo users:', kUsers.map(u => u.id + ':' + u.name).join(', '));
  const varvara = kUsers.find(u => u.name && u.name.toLowerCase().includes('varvar'));
  console.log('Varvara:', varvara ? varvara.id + ':' + varvara.name : 'NOT FOUND');

  console.log('\nSCOUT_DONE');
}

main().catch(e => { console.error('ERROR:', e.response ? JSON.stringify(e.response.data) : e.message); });
