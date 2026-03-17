// check-migration-index.js — анализ migration_index.json
var fs = require('fs');
var idx = JSON.parse(fs.readFileSync('/var/www/amoschool/backend/backups/migration_index.json', 'utf8'));

console.log('=== migration_index.json ===');
console.log('Top-level keys:', Object.keys(idx));

Object.keys(idx).forEach(function(k) {
  var count = Object.keys(idx[k]).length;
  console.log('  ' + k + ': ' + count + ' entries');
  // Show first 3 entries as sample
  var keys = Object.keys(idx[k]).slice(0, 3);
  keys.forEach(function(amoId) {
    console.log('    amo=' + amoId + ' => kommo=' + idx[k][amoId]);
  });
});

// File size
var stat = fs.statSync('/var/www/amoschool/backend/backups/migration_index.json');
console.log('\nFile size:', (stat.size / 1024).toFixed(1) + ' KB');
console.log('Last modified:', stat.mtime.toISOString());
