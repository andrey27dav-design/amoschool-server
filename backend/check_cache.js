const c = require('/var/www/amoschool/backend/backups/amo_data_cache.json');

// Check lead embedded
const lead = c.leads.find(l => l.id === 31635363);
console.log('=== LEAD 31635363 ===');
console.log('Found:', !!lead);
if (lead) {
  console.log('lead._embedded:', JSON.stringify(lead._embedded));
}

// Check tasks
const allTasks = [...(c.leadTasks || []), ...(c.tasks || [])];
console.log('\n=== TASKS ===');
console.log('leadTasks count:', c.leadTasks && c.leadTasks.length);
console.log('tasks count:', c.tasks && c.tasks.length);
const lt = allTasks.filter(t => t.entity_id === 31635363);
console.log('tasks for lead 31635363:', JSON.stringify(lt));

// Check notes sample
console.log('\n=== LEAD NOTES (first 3) ===');
const lnotes = (c.leadNotes || []).filter(n => n.entity_id === 31635363);
console.log('notes for lead 31635363 count:', lnotes.length);
if (lnotes.length > 0) console.log('sample:', JSON.stringify(lnotes[0]));

// Check contacts cache
console.log('\n=== CONTACTS in cache ===');
console.log('contacts count:', c.contacts && c.contacts.length);
const contact = c.contacts && c.contacts.find(x => x.id === 32191201);
console.log('contact 32191201:', contact ? contact.name : 'NOT FOUND');
