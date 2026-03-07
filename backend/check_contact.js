// Check contact structure
const c = require('./src/cache/cacheManager');
const contacts = c.loadCache ? c.loadCache().contacts : [];
console.log('Total contacts:', contacts.length);
if (contacts.length > 0) {
  const sample = contacts.find(ct => ct._embedded && ct._embedded.leads);
  if (sample) {
    console.log('Contact', sample.id, 'has _embedded.leads:', JSON.stringify(sample._embedded.leads.slice(0, 3)));
  } else {
    console.log('No contacts have _embedded.leads');
    const s2 = contacts[0];
    console.log('Sample _embedded keys:', s2._embedded ? Object.keys(s2._embedded) : 'no _embedded');
    console.log('Sample keys:', Object.keys(s2).slice(0, 15));
  }
  // Check contact #25650443 specifically
  const target = contacts.find(ct => ct.id === 25650443);
  if (target) {
    console.log('\nTarget contact 25650443:');
    console.log('  _embedded keys:', target._embedded ? Object.keys(target._embedded) : 'none');
    if (target._embedded && target._embedded.leads) {
      console.log('  leads:', JSON.stringify(target._embedded.leads));
    }
  }
}
