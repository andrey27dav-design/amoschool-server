// Check note types in cache for contact 32191201
const cache = require('/var/www/amoschool/backend/backups/amo_data_cache.json');
const notes = (cache.contactNotes || []).filter(n => n.entity_id === 32191201);
console.log(`Contact 32191201 has ${notes.length} notes`);
if (notes.length > 0) {
  // Show unique note_types
  const types = [...new Set(notes.map(n => n.note_type))];
  console.log('Note types:', types);
  console.log('First note sample:', JSON.stringify(notes[0], null, 2));
}

// Also check lead notes
const leadNotes = (cache.leadNotes || []).filter(n => n.entity_id === 31635363);
console.log(`\nLead 31635363 has ${leadNotes.length} notes`);
if (leadNotes.length > 0) {
  const types = [...new Set(leadNotes.map(n => n.note_type))];
  console.log('Note types:', types);
  console.log('First note sample:', JSON.stringify(leadNotes[0], null, 2));
}
