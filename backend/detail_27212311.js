const fse = require('fs-extra');
const c = fse.readJsonSync('/var/www/amoschool/backend/backups/amo_data_cache.json');

const LEAD_ID = 27212311;
const CONTACT_IDS = [27365697, 30703459];

// Tasks
const leadTasks    = (c.leadTasks    || []).filter(t => Number(t.entity_id) === LEAD_ID);
const contactTasks = (c.contactTasks || []).filter(t => CONTACT_IDS.includes(Number(t.entity_id)));

// Notes
const leadNotes    = (c.leadNotes    || []).filter(n => Number(n.entity_id) === LEAD_ID);
const contactNotes = (c.contactNotes || []).filter(n => CONTACT_IDS.includes(Number(n.entity_id)));

console.log('=== Сделка AMO #27212311 ===');
console.log(`  Задачи сделки:      ${leadTasks.length} (завершённых: ${leadTasks.filter(t=>t.is_completed).length})`);
leadTasks.forEach(t => console.log(`    #${t.id} cmp=${t.is_completed} "${String(t.text||'').substring(0,50)}"`));

console.log(`  Задачи контактов:   ${contactTasks.length}`);
contactTasks.forEach(t => console.log(`    #${t.id} contact=${t.entity_id} cmp=${t.is_completed} "${String(t.text||'').substring(0,50)}"`));

console.log(`  Заметки сделки:     ${leadNotes.length}`);
const noteTypes = {};
leadNotes.forEach(n => { noteTypes[n.note_type] = (noteTypes[n.note_type]||0)+1; });
console.log(`    по типам: ${JSON.stringify(noteTypes)}`);

console.log(`  Заметки контактов:  ${contactNotes.length}`);
const cNoteTypes = {};
contactNotes.forEach(n => { cNoteTypes[n.note_type] = (cNoteTypes[n.note_type]||0)+1; });
console.log(`    по типам: ${JSON.stringify(cNoteTypes)}`);
