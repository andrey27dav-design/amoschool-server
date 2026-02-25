const amoApi = require('./src/services/amoApi');
const kommoApi = require('./src/services/kommoApi');

(async () => {
  for (const entity of ['leads', 'contacts']) {
    console.log('\n═══════════════════════════════════════');
    console.log(`ENTITY: ${entity.toUpperCase()}`);
    console.log('═══════════════════════════════════════');

    const [amoFields, kommoFields] = await Promise.all([
      amoApi.getCustomFields(entity),
      kommoApi.getCustomFields(entity),
    ]);

    console.log(`\n── AMO fields (${amoFields.length}) ──`);
    amoFields.forEach(f => {
      const enums = (f.enums || []).map(e => e.value).join(' | ');
      console.log(`  [${f.id}] "${f.name}" type=${f.type}${enums ? ' enums=[' + enums + ']' : ''}`);
    });

    console.log(`\n── Kommo fields (${kommoFields.length}) ──`);
    kommoFields.forEach(f => {
      const enums = (f.enums || []).map(e => e.value).join(' | ');
      console.log(`  [${f.id}] "${f.name}" type=${f.type}${enums ? ' enums=[' + enums + ']' : ''}`);
    });
  }
})().catch(e => console.error(e.message));
