// Script to fetch salesbots from AMO and Kommo CRM
const https = require('https');
const path = require('path');
const fs = require('fs');

// Load .env manually — try multiple locations
const envPath = process.env.ENV_PATH || '/var/www/amoschool/backend/.env';
const env = {};
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
});

const AMO_TOKEN = env.AMO_TOKEN;
const AMO_BASE_URL = env.AMO_BASE_URL || 'https://houch.amocrm.ru';
const KOMMO_TOKEN = env.KOMMO_TOKEN;
const KOMMO_BASE_URL = env.KOMMO_BASE_URL || 'https://helloshkolaonlinecom.kommo.com';

function get(baseUrl, path, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(baseUrl + path);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('Fetching salesbots from AMO CRM...');
  const amoRes = await get(AMO_BASE_URL, '/api/v4/salesbot?limit=50', AMO_TOKEN);
  console.log('AMO status:', amoRes.status);
  
  let amoBots = [];
  if (amoRes.status === 200) {
    const parsed = JSON.parse(amoRes.body);
    amoBots = parsed._embedded?.salesbot || [];
    console.log('AMO bots count:', amoBots.length);
    amoBots.forEach(b => console.log(' -', b.id, b.name));
  } else {
    console.log('AMO error:', amoRes.body.substring(0, 500));
  }

  console.log('\nFetching salesbots from Kommo CRM...');
  const kommoRes = await get(KOMMO_BASE_URL, '/api/v4/salesbot?limit=50', KOMMO_TOKEN);
  console.log('Kommo status:', kommoRes.status);
  
  let kommoBots = [];
  if (kommoRes.status === 200) {
    const parsed = JSON.parse(kommoRes.body);
    kommoBots = parsed._embedded?.salesbot || [];
    console.log('Kommo bots count:', kommoBots.length);
    kommoBots.forEach(b => console.log(' -', b.id, b.name));
  } else {
    console.log('Kommo error:', kommoRes.body.substring(0, 500));
  }

  // Find UTMKI bot in AMO
  const utmkiBot = amoBots.find(b => b.name && b.name.toUpperCase().includes('UTMKI'));
  if (utmkiBot) {
    console.log('\n=== UTMKI bot found in AMO ===');
    fs.writeFileSync('/tmp/amo_utmki_bot.json', JSON.stringify(utmkiBot, null, 2));
    console.log('Saved to /tmp/amo_utmki_bot.json');
    console.log('Bot ID:', utmkiBot.id);
    console.log('Bot name:', utmkiBot.name);
    // Show pipeline/stages referenced
    const bodyStr = JSON.stringify(utmkiBot);
    const fieldMatches = bodyStr.match(/"field_id"\s*:\s*(\d+)/g) || [];
    const stageMatches = bodyStr.match(/"step_id"\s*:\s*(\d+)/g) || [];
    const userMatches = bodyStr.match(/"responsible_user_id"\s*:\s*(\d+)/g) || [];
    console.log('Field IDs referenced:', [...new Set(fieldMatches.map(m => m.match(/\d+/)[0]))].join(', '));
    console.log('Step IDs referenced:', [...new Set(stageMatches.map(m => m.match(/\d+/)[0]))].join(', '));
    console.log('User IDs referenced:', [...new Set(userMatches.map(m => m.match(/\d+/)[0]))].join(', '));
  } else {
    console.log('\nUTMKI bot not found in AMO. All bot names:');
    amoBots.forEach(b => console.log(' -', b.id, '|', b.name));
  }

  // Find UTMKI bot in Kommo  
  const utmkiKommo = kommoBots.find(b => b.name && b.name.toUpperCase().includes('UTMKI'));
  if (utmkiKommo) {
    console.log('\n=== UTMKI bot found in Kommo ===');
    fs.writeFileSync('/tmp/kommo_utmki_bot.json', JSON.stringify(utmkiKommo, null, 2));
    console.log('Saved to /tmp/kommo_utmki_bot.json');
    console.log('Bot ID:', utmkiKommo.id);
  } else {
    console.log('\nUTMKI bot not found in Kommo. All bot names:');
    kommoBots.forEach(b => console.log(' -', b.id, '|', b.name));
  }

  // Save full lists
  fs.writeFileSync('/tmp/amo_all_bots.json', JSON.stringify(amoBots, null, 2));
  fs.writeFileSync('/tmp/kommo_all_bots.json', JSON.stringify(kommoBots, null, 2));
  console.log('\nFull lists saved to /tmp/amo_all_bots.json and /tmp/kommo_all_bots.json');
}

main().catch(console.error);
