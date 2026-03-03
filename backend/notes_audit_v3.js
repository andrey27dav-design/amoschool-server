const axios = require('axios');
const fs = require('fs');
require('dotenv').config({path:'/var/www/amoschool/backend/.env'});
const amoToken = process.env.AMO_TOKEN;
const kommoToken = process.env.KOMMO_TOKEN;
const SKIP_NOTE_TYPES = new Set([10, 11, 'amomail_message', 'extended_service_message', 'lead_auto_created']);

async function run() {
  const idx = JSON.parse(fs.readFileSync('/var/www/amoschool/backend/backups/migration_index.json', 'utf8'));
  const leadsMap = idx.leads || {};
  const notesLeadsIdx = idx.notes_leads || {};

  const amoLeadIds = Object.keys(leadsMap);
  console.log('Total migrated leads:', amoLeadIds.length);
  console.log('Notes in index:', Object.keys(notesLeadsIdx).length);

  const results = [];

  for (const amoId of amoLeadIds) {
    const kommoId = leadsMap[amoId];

    const amoR = await axios.get('https://houch.amocrm.ru/api/v4/leads/'+amoId+'/notes?limit=50', {
      headers: { 'Authorization': 'Bearer ' + amoToken }
    });
    const amoNotes = (amoR.data._embedded ? amoR.data._embedded.notes : [])
      .filter(n => !SKIP_NOTE_TYPES.has(n.note_type));

    const kommoR = await axios.get('https://helloshkolaonlinecom.kommo.com/api/v4/leads/'+kommoId+'/notes?limit=50', {
      headers: { 'Authorization': 'Bearer ' + kommoToken }
    });
    const kommoNotes = (kommoR.data._embedded ? kommoR.data._embedded.notes : [])
      .filter(n => n.note_type !== 'service_message');

    const kommoNoteIds = new Set(kommoNotes.map(n => String(n.id)));

    const inIndexButMissingKommo = amoNotes.filter(n => {
      const kommoNoteId = notesLeadsIdx[String(n.id)];
      return kommoNoteId && !kommoNoteIds.has(String(kommoNoteId));
    });

    const notInIndex = amoNotes.filter(n => !notesLeadsIdx[String(n.id)]);

    results.push({
      amoId, kommoId,
      amoCount: amoNotes.length,
      kommoCount: kommoNotes.length,
      notInIndex: notInIndex.length,
      inIndexButMissingKommo: inIndexButMissingKommo.length,
      orphanedNotes: inIndexButMissingKommo.map(n => ({
        amoNoteId: String(n.id),
        kommoNoteId: String(notesLeadsIdx[String(n.id)]),
        text: n.params && n.params.text ? n.params.text.substring(0, 60) : ''
      }))
    });
  }

  console.log('\n=== AUDIT RESULTS ===');
  let totalOrphaned = 0;
  let totalNotMigrated = 0;
  const dealsNeedRefix = [];

  for (const r of results) {
    const ok = r.kommoCount === r.amoCount && r.inIndexButMissingKommo === 0;
    const s = ok ? 'OK' : 'PROBLEM';
    console.log('['+s+'] AMO:'+r.amoId+' Kommo:'+r.kommoId+' | amoNotes:'+r.amoCount+' kommoNotes:'+r.kommoCount+' orphaned:'+r.inIndexButMissingKommo+' notMigrated:'+r.notInIndex);
    if (r.inIndexButMissingKommo > 0) {
      r.orphanedNotes.forEach(d => console.log('   ORPHAN: amoNote='+d.amoNoteId+' kommoNote='+d.kommoNoteId+' "'+d.text+'"'));
      dealsNeedRefix.push(r.amoId);
    }
    totalOrphaned += r.inIndexButMissingKommo;
    totalNotMigrated += r.notInIndex;
  }

  console.log('\n=== SUMMARY ===');
  console.log('In index but MISSING from Kommo (orphaned):', totalOrphaned);
  console.log('Never migrated (not in index):', totalNotMigrated);
  console.log('Deals with orphaned entries:', dealsNeedRefix.length, dealsNeedRefix);

  fs.writeFileSync('/tmp/audit_result.json', JSON.stringify({ dealsNeedRefix, results }, null, 2));
  console.log('Saved /tmp/audit_result.json');
}
run().catch(e => console.error(e.response ? JSON.stringify(e.response.data) : e.message));
