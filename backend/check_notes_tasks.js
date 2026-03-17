const fs = require('fs-extra');
const idx = fs.readJsonSync('/var/www/amoschool/backend/backups/migration_index.json');
const cache = fs.readJsonSync('/var/www/amoschool/backend/backups/amo_data_cache.json');

const amoLeadIds = [25630433, 28405705, 28071467];

console.log('=== INDEX STATS ===');
console.log('notes_leads:', Object.keys(idx.notes_leads || {}).length, 'entries');
console.log('tasks_leads:', Object.keys(idx.tasks_leads || {}).length, 'entries');

// Check cache for notes belonging to these leads
const leadNotes = cache.leadNotes || [];
console.log('\n=== NOTES IN CACHE FOR TARGET LEADS ===');
console.log('Total leadNotes in cache:', leadNotes.length);
const relevantNotes = leadNotes.filter(n => amoLeadIds.includes(Number(n.entity_id)));
console.log('Notes for target leads:', relevantNotes.length);
relevantNotes.forEach(n => {
  const inIndex = (idx.notes_leads || {})[n.id];
  console.log('  Note', n.id, '| type:', n.note_type, '| lead:', n.entity_id, '| in_index:', !!inIndex, '| kommo_id:', inIndex || '---');
});

// Check cache for tasks belonging to these leads
const allTasks = cache.leadTasks || [];
console.log('\n=== TASKS IN CACHE FOR TARGET LEADS ===');
console.log('Total leadTasks in cache:', allTasks.length);
const relevantTasks = allTasks.filter(t => amoLeadIds.includes(Number(t.entity_id)));
console.log('Tasks for target leads:', relevantTasks.length);
relevantTasks.forEach(t => {
  const inIndex = (idx.tasks_leads || {})[t.id];
  console.log('  Task', t.id, '| entity_id:', t.entity_id, '| entity_type:', t.entity_type, '| text:', (t.text || '').substring(0, 60), '| in_index:', !!inIndex, '| kommo_id:', inIndex || '---');
});

// Also check if there's ANYTHING in migration_index for these leads as main entities
console.log('\n=== LEADS IN MIGRATION INDEX ===');
const leadsIndex = idx.leads || {};
amoLeadIds.forEach(id => {
  const kommoId = leadsIndex[id];
  console.log('  Lead AMO#' + id + ' -> Kommo#' + (kommoId || 'NOT FOUND'));
});
