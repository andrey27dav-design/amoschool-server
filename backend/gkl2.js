process.chdir('/var/www/amoschool/backend');
const kommoApi = require('/var/www/amoschool/backend/src/services/kommoApi');

async function main() {
  const leadsFields = await kommoApi.getCustomFields('leads');
  console.log('\n=== KOMMO LEADS FIELDS ===');
  for (const f of leadsFields) {
    const apiOnly = f.is_api_only ? ' [API_ONLY]' : '';
    const enums = f.enums ? f.enums.map(e => e.value).join(' | ') : '';
    console.log(`  [${f.group_id||'none'}] "${f.name}" (${f.type})${apiOnly}`);
    if (enums) console.log(`    >> ${enums}`);
  }
}
main().catch(e => console.error('ERROR:', e.message, e.stack));
