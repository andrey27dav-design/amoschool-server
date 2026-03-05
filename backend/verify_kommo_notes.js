const https = require('https');

const KOMMO_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImFiNmFlNzdiNjI4NWQ1ZmYwNmM0MmY4ZjQ2NjRhYmU0NGNkNDgzMWJlZTRhNDM2MzI0NjEyZGY1N2FjZGNkYzUwNjRlYTFjNDk2ZDQxN2E3In0.eyJhdWQiOiI3MTU3NTZiYS00MTk3LTQ5MWItYTQ2MS0wOTlkMDJkNTdlMTYiLCJqdGkiOiJhYjZhZTc3YjYyODVkNWZmMDZjNDJmOGY0NjY0YWJlNDRjZDQ4MzFiZWU0YTQzNjMyNDYxMmRmNTdhY2RjZGM1MDY0ZWExYzQ5NmQ0MTdhNyIsImlhdCI6MTc3MTQ4NjExNiwibmJmIjoxNzcxNDg2MTE2LCJleHAiOjE4MzAyOTc2MDAsInN1YiI6IjEyNzM5Nzk1IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjM0MTkyNTIzLCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJjcm0iLCJmaWxlcyIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJwdXNoX25vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiM2ZmYzRmYjItOTRiNy00ZWFhLTkzY2QtMmU1YzU4ZWQwMjlmIiwiYXBpX2RvbWFpbiI6ImFwaS1nLmtvbW1vLmNvbSJ9.J-fe71D0ODNz_OvlZIJSP0dZ-DSN9qUUtCjDxmcm76l-X2oiKTrlQht6gPuPygEgbdezr-9DD5mqxdYAnVNi92eahqLTWAiVS9UmieiFc2duGnYwlKO3zJ44zd0hV_D29HTPawhNAjm3bur19FKYSV7teJKUCPdSVOkp_ew7I2TmEszKqvGTisWubplGz9wUROBefUzjCKGgMSXXhqZm27FHKE6RhAUTSagys6o09dxxh2gGktEXJ5BpoQ2Q3GX3y-I8YDPHs-R6bbxLz6SUol3s5fzobM9KNY1NgbNZ1297v43Wp2PUTLfgDY7fDX4d7zFjGFYlYjn-2XOvdFiTQA';

function kommoGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'helloshkolaonlinecom.kommo.com',
      path,
      method: 'GET',
      headers: { Authorization: 'Bearer ' + KOMMO_TOKEN }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        let body = null;
        try { body = data.trim() ? JSON.parse(data) : {}; } catch(e) { body = { _parseError: data.substring(0,200) }; }
        resolve({ status: res.statusCode, body });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const kommoLeadIds = [18330163, 18330165, 18330167];
  
  for (const leadId of kommoLeadIds) {
    console.log(`\n=== KOMMO LEAD ${leadId} ===`);
    
    // Fetch notes for this lead
    const notesRes = await kommoGet(`/api/v4/leads/${leadId}/notes?limit=50`);
    const notes = notesRes.body?._embedded?.notes || [];
    console.log(`Notes (HTTP ${notesRes.status}): ${notes.length} notes found`);
    if (notesRes.status !== 200 && notesRes.status !== 204) {
      console.log('  Response:', JSON.stringify(notesRes.body).substring(0, 300));
    }
    notes.forEach(n => console.log(`  Note ${n.id} | entity_id: ${n.entity_id} | type: ${n.note_type}`));
    
    // Fetch tasks for this lead
    const tasksRes = await kommoGet(`/api/v4/tasks?filter[entity_id]=${leadId}&filter[entity_type]=leads&limit=50`);
    const tasks = tasksRes.body?._embedded?.tasks || [];
    console.log(`Tasks (HTTP ${tasksRes.status}): ${tasks.length} tasks found`);
    tasks.forEach(t => console.log(`  Task ${t.id} | entity_id: ${t.entity_id} | type: ${t.entity_type} | text: ${(t.text||'').substring(0,50)}`));
  }
  
  // Directly fetch specific notes by ID from migration index
  console.log('\n=== CHECK SPECIFIC NOTES BY ID (from migration_index) ===');
  const noteIds = [7453731, 7453733, 7470367, 7470369];
  for (const nid of noteIds) {
    const r = await kommoGet(`/api/v4/leads/notes?id[]=${nid}`);
    const items = r.body?._embedded?.notes || [];
    if (items.length > 0) {
      console.log(`  Note ${nid}: entity_id=${items[0].entity_id} | type=${items[0].note_type} | HTTP ${r.status}`);
    } else {
      console.log(`  Note ${nid}: NOT FOUND (HTTP ${r.status}) body: ${JSON.stringify(r.body).substring(0,100)}`);
    }
  }
  
  // Directly fetch specific task IDs
  console.log('\n=== CHECK SPECIFIC TASKS BY ID (from migration_index) ===');
  const taskIds = [2297159, 2297161, 2321465, 2321473];
  for (const tid of taskIds) {
    const r = await kommoGet(`/api/v4/tasks/${tid}`);
    if (r.status === 200) {
      console.log(`  Task ${tid}: entity_id=${r.body.entity_id} | entity_type=${r.body.entity_type} | text=${(r.body.text||'').substring(0,50)}`);
    } else {
      console.log(`  Task ${tid}: NOT FOUND (HTTP ${r.status})`);
    }
  }
}

main().catch(console.error);
