const fse = require('fs-extra');

const idx = fse.readJsonSync('/var/www/amoschool/backend/backups/migration_index.json');
console.log('Index keys:', Object.keys(idx));
console.log('\nSection sizes:');
for (const key of Object.keys(idx)) {
  const section = idx[key];
  if (section && Array.isArray(section.pairs)) {
    console.log(' ', key, ': pairs=', section.pairs.length);
  } else if (Array.isArray(section)) {
    console.log(' ', key, ': array len=', section.length);
  } else {
    console.log(' ', key, ':', JSON.stringify(section).slice(0, 80));
  }
}

// Check if any recent task entries
const taskKeys = Object.keys(idx).filter(k => k.includes('task'));
for (const k of taskKeys) {
  const s = idx[k];
  const pairs = s && s.pairs || [];
  console.log('\n' + k + ' last 3:', JSON.stringify(pairs.slice(-3)));
}
