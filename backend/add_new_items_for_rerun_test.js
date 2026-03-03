/**
 * Add NEW tasks & notes to test lead 31652221 in amo CRM (for second transfer test)
 * These will be added AFTER the first migration, to test dedup behavior on re-run
 */
const https = require('https');

const AMO_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImI5MGYyZjIxNTIxMGQxNGQ0MTg0NDRhODBkMzBjODlkOTcwMmU4NTBmNjk5YTg3ODk4ODQ5ZmNiMWM1ZWJlZmRjZjAwNGY5ZmQzNzA4Zjg1In0.eyJhdWQiOiJmYzNmMTU4NS0zM2E0LTQwOTMtOTE1Zi0xMWE0OGE1OWUwY2MiLCJqdGkiOiJiOTBmMmYyMTUyMTBkMTRkNDE4NDQ0YTgwZDMwYzg5ZDk3MDJlODUwZjY5OWE4Nzg5ODg0OWZjYjFjNWViZWZkY2YwMDRmOWZkMzcwOGY4NSIsImlhdCI6MTc3MTQ4NjU4MiwibmJmIjoxNzcxNDg2NTgyLCJleHAiOjE4MzAyOTc2MDAsInN1YiI6IjYyMTc3NjgiLCJncmFudF90eXBlIjoiIiwiYWNjb3VudF9pZCI6Mjg5ODcyNTIsImJhc2VfZG9tYWluIjoiYW1vY3JtLnJ1IiwidmVyc2lvbiI6Miwic2NvcGVzIjpbImNybSIsImZpbGVzIiwiZmlsZXNfZGVsZXRlIiwibm90aWZpY2F0aW9ucyIsInB1c2hfbm90aWZpY2F0aW9ucyJdLCJoYXNoX3V1aWQiOiI5ZDFmYzQ2Zi02ZGRhLTRiMjItYTZkYy0zNzJiYTI5YTU1YjEiLCJhcGlfZG9tYWluIjoiYXBpLWIuYW1vY3JtLnJ1In0.HiQPlgnA5h_YEplP4MawVuktKA0wgKWT4Gag-JHIn3yt-0E-q7GO_At0L4ZSV044-R8r9qRFfl5IFUIzx1sB_xXGVdckukIYbjUpfUAy1iRChC2fGWJ7ATjZaR8sQT6tcBXB6wnDJCOoWZgEtJaOyUASvDm_TTltATuieUkSOJ5FQvc2ggfRZ4x_KjFCvAlmwoMeRJv0t3YUXv7PZ4DRJxR7CdW0SQge3hWFmDXi_HBW8e-eP2cLNp3hw_iA7r_xb1LGGYba3fS8_HzBJEnxxnoPiYnxywqK6Ug3ZxpO-SfXyI5IwrwM62q9W6ElZ5ZVPBjkpaKAOclnrO_SUfRlNA';
const AMO_DOMAIN = 'houch.amocrm.ru';
const LEAD_ID = 31652221;
const CONTACT1_ID = 32209887;
const ADMIN_ID = 6217768;

function amoRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: AMO_DOMAIN,
      path,
      method,
      headers: {
        'Authorization': `Bearer ${AMO_TOKEN}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const req = https.request(opts, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const now = Math.floor(Date.now() / 1000);
  const in2days = now + 2 * 24 * 3600;

  console.log('Adding NEW task to lead 31652221...');
  const taskResp = await amoRequest('POST', '/api/v4/tasks', [
    {
      task_type_id: 1,
      text: '[НОВАЯ ЗАДАЧА] После первой миграции - проверить дублирование',
      complete_till: in2days,
      entity_id: LEAD_ID,
      entity_type: 'leads',
      responsible_user_id: ADMIN_ID
    }
  ]);
  console.log(`Task status: ${taskResp.status}`);
  const taskItems = taskResp.body?._embedded?.tasks || [];
  console.log('Created tasks:', taskItems.map(t => `id=${t.id}`).join(', '));

  await new Promise(r => setTimeout(r, 1000));

  console.log('\nAdding NEW note to lead 31652221...');
  const noteResp = await amoRequest('POST', `/api/v4/leads/${LEAD_ID}/notes`, [
    {
      note_type: 'common',
      params: { text: '[НОВЫЙ КОММЕНТАРИЙ] Добавлен после первой миграции - тест на дублирование задач и заметок' }
    }
  ]);
  console.log(`Note status: ${noteResp.status}`);
  const noteItems = noteResp.body?._embedded?.notes || [];
  console.log('Created notes:', noteItems.map(n => `id=${n.id}`).join(', '));

  await new Promise(r => setTimeout(r, 1000));

  console.log('\nAdding NEW note to contact 32209887...');
  const cNoteResp = await amoRequest('POST', `/api/v4/contacts/${CONTACT1_ID}/notes`, [
    {
      note_type: 'common',
      params: { text: '[НОВЫЙ КОММЕНТАРИЙ К КОНТАКТУ] Добавлен после первой миграции' }
    }
  ]);
  console.log(`Contact note status: ${cNoteResp.status}`);
  const cNoteItems = cNoteResp.body?._embedded?.notes || [];
  console.log('Created contact notes:', cNoteItems.map(n => `id=${n.id}`).join(', '));

  console.log('\nAll new items added. Ready for second transfer test.');
  console.log('Lead note IDs created:', noteItems.map(n => n.id));
  console.log('Contact note IDs created:', cNoteItems.map(n => n.id));
  console.log('Task IDs created:', taskItems.map(t => t.id));
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
