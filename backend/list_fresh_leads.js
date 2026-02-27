const c   = require('/var/www/amoschool/backend/backups/amo_data_cache.json');
const idx = require('/var/www/amoschool/backend/backups/migration_index.json');
const migrated = new Set(Object.keys(idx.leads || {}).map(Number));
const fresh = c.leads.filter(l => !migrated.has(l.id)).slice(0, 10);
console.log('=== Лиды, НЕ перенесённые (первые 10) ===');
fresh.forEach(l => {
  const contacts = (l._embedded && l._embedded.contacts || []).map(c => c.id);
  const companies = (l._embedded && l._embedded.companies || []).map(c => c.id);
  console.log('id=' + l.id + ' name="' + l.name + '" status=' + l.status_id + ' contacts=[' + contacts + '] companies=[' + companies + ']');
});
console.log('\nВсего в кэше:', c.leads.length, '| Уже перенесено:', Object.keys(idx.leads || {}).length);
