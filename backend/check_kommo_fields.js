const kommoApi = require('./src/services/kommoApi');
(async () => {
  const fields = await kommoApi.getCustomFields('leads');
  const hits = fields.filter(f => {
    const n = (f.name || '').toLowerCase();
    return n.includes('источник') || n.includes('source');
  });
  console.log('Total leads fields in Kommo:', fields.length);
  console.log('Fields matching источник/source:');
  hits.forEach(f => {
    const enums = (f.enums || []).map(e => e.value).join(', ');
    console.log('  ID:', f.id, '| Name:', f.name, '| Type:', f.type, '| Enums count:', (f.enums||[]).length);
    if (f.enums && f.enums.length > 0) console.log('    Values:', enums.substring(0, 200));
  });
  // Also list fields matching продукт
  const prod = fields.filter(f => {
    const n = (f.name || '').toLowerCase();
    return n.includes('продукт') || n.includes('product');
  });
  console.log('\nFields matching продукт/product:');
  prod.forEach(f => console.log('  ID:', f.id, '| Name:', f.name, '| Type:', f.type, '| Enums:', (f.enums||[]).length));
})().catch(e => console.error(e.message));
