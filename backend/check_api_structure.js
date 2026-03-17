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
  console.log('Top-level keys:', Object.keys(a));
  for (const k of ['leads','contacts','companies']) {
    if (a[k]) {
      console.log(`\n${k}: keys=`, Object.keys(a[k]));
      if (a[k].groups) console.log(`  groups count: ${a[k].groups.length}, first group:`, JSON.stringify(a[k].groups[0]).slice(0, 200));
    }
  }
  console.log('\nsummary:', a.summary);
})().catch(e => console.error(e.message));
