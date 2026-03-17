const http = require('http');
function fetchAnalysis() {
  return new Promise((resolve, reject) => {
    http.get({ hostname: 'localhost', port: 3008, path: '/api/migration/fields-analysis' }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}
(async () => {
  const a = await fetchAnalysis();
  for (const [ek, ev] of Object.entries(a.entities || {})) {
    (ev.groups || []).forEach(g => {
      (g.fields || []).forEach(fp => {
        if (fp.status !== 'partial') return;
        console.log(`\n[${ek}] group="${g.name}" | AMO: "${fp.amo?.name}" (${fp.amo?.type}) → Kommo: "${fp.kommo?.name}" (${fp.kommo?.type})`);
        console.log('  AMO enums  :', (fp.amo?.enums||[]).map(e=>e.value).join(' | '));
        console.log('  Kommo enums:', (fp.kommo?.enums||[]).map(e=>e.value).join(' | '));
        console.log('  missingEnums:', (fp.missingEnums||[]).map(e=>e.value).join(' | '));
      });
    });
  }
})().catch(e => console.error(e.message));
