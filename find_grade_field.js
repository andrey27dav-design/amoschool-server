const https = require('https');

const AMO_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImI5MGYyZjIxNTIxMGQxNGQ0MTg0NDRhODBkMzBjODlkOTcwMmU4NTBmNjk5YTg3ODk4ODQ5ZmNiMWM1ZWJlZmRjZjAwNGY5ZmQzNzA4Zjg1In0.eyJhdWQiOiJmYzNmMTU4NS0zM2E0LTQwOTMtOTE1Zi0xMWE0OGE1OWUwY2MiLCJqdGkiOiJiOTBmMmYyMTUyMTBkMTRkNDE4NDQ0YTgwZDMwYzg5ZDk3MDJlODUwZjY5OWE4Nzg5ODg0OWZjYjFjNWViZWZkY2YwMDRmOWZkMzcwOGY4NSIsImlhdCI6MTc3MTQ4NjU4MiwibmJmIjoxNzcxNDg2NTgyLCJleHAiOjE4MzAyOTc2MDAsInN1YiI6IjYyMTc3NjgiLCJncmFudF90eXBlIjoiIiwiYWNjb3VudF9pZCI6Mjg5ODcyNTIsImJhc2VfZG9tYWluIjoiYW1vY3JtLnJ1IiwidmVyc2lvbiI6Miwic2NvcGVzIjpbImNybSIsImZpbGVzIiwiZmlsZXNfZGVsZXRlIiwibm90aWZpY2F0aW9ucyIsInB1c2hfbm90aWZpY2F0aW9ucyJdLCJoYXNoX3V1aWQiOiI5ZDFmYzQ2Zi02ZGRhLTRiMjItYTZkYy0zNzJiYTI5YTU1YjEiLCJhcGlfZG9tYWluIjoiYXBpLWIuYW1vY3JtLnJ1In0.HiQPlgnA5h_YEplP4MawVuktKA0wgKWT4Gag-JHIn3yt-0E-q7GO_At0L4ZSV044-R8r9qRFfl5IFUIzx1sB_xXGVdckukIYbjUpfUAy1iRChC2fGWJ7ATjZaR8sQT6tcBXB6wnDJCOoWZgEtJaOyUASvDm_TTltATuieUkSOJ5FQvc2ggfRZ4x_KjFCvAlmwoMeRJv0t3YUXv7PZ4DRJxR7CdW0SQge3hWFmDXi_HBW8e-eP2cLNp3hw_iA7r_xb1LGGYba3fS8_HzBJEnxxnoPiYnxywqK6Ug3ZxpO-SfXyI5IwrwM62q9W6ElZ5ZVPBjkpaKAOclnrO_SUfRlNA';
const KOMMO_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImFiNmFlNzdiNjI4NWQ1ZmYwNmM0MmY4ZjQ2NjRhYmU0NGNkNDgzMWJlZTRhNDM2MzI0NjEyZGY1N2FjZGNkYzUwNjRlYTFjNDk2ZDQxN2E3In0.eyJhdWQiOiI3MTU3NTZiYS00MTk3LTQ5MWItYTQ2MS0wOTlkMDJkNTdlMTYiLCJqdGkiOiJhYjZhZTc3YjYyODVkNWZmMDZjNDJmOGY0NjY0YWJlNDRjZDQ4MzFiZWU0YTQzNjMyNDYxMmRmNTdhY2RjZGM1MDY0ZWExYzQ5NmQ0MTdhNyIsImlhdCI6MTc3MTQ4NjExNiwibmJmIjoxNzcxNDg2MTE2LCJleHAiOjE4MzAyOTc2MDAsInN1YiI6IjEyNzM5Nzk1IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjM0MTkyNTIzLCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJjcm0iLCJmaWxlcyIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJwdXNoX25vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiM2ZmYzRmYjItOTRiNy00ZWFhLTkzY2QtMmU1YzU4ZWQwMjlmIiwiYXBpX2RvbWFpbiI6ImFwaS1nLmtvbW1vLmNvbSJ9.J-fe71D0ODNz_OvlZIJSP0dZ-DSN9qUUtCjDxmcm76l-X2oiKTrlQht6gPuPygEgbdezr-9DD5mqxdYAnVNi92eahqLTWAiVS9UmieiFc2duGnYwlKO3zJ44zd0hV_D29HTPawhNAjm3bur19FKYSV7teJKUCPdSVOkp_ew7I2TmEszKqvGTisWubplGz9wUROBefUzjCKGgMSXXhqZm27FHKE6RhAUTSagys6o09dxxh2gGktEXJ5BpoQ2Q3GX3y-I8YDPHs-R6bbxLz6SUol3s5fzobM9KNY1NgbNZ1297v43Wp2PUTLfgDY7fDX4d7zFjGFYlYjn-2XOvdFiTQA';

function get(host, path, token) {
  return new Promise((resolve, reject) => {
    const options = { hostname: host, path, method: 'GET', headers: { Authorization: 'Bearer ' + token } };
    let data = '';
    const req = https.request(options, res => {
      res.on('data', d => data += d);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  // Ищем в AMO поле "Оценка после пробного"
  let page = 1, found_amo = null;
  while (!found_amo) {
    const r = await get('houch.amocrm.ru', `/api/v4/leads/custom_fields?limit=50&page=${page}`, AMO_TOKEN);
    const fields = r._embedded && r._embedded.custom_fields || [];
    if (!fields.length) break;
    const f = fields.find(f => f.name && f.name.toLowerCase().includes('оценка'));
    if (f) { found_amo = f; break; }
    if (!r._links || !r._links.next) break;
    page++;
  }
  console.log('AMO field:', found_amo ? `id=${found_amo.id} name="${found_amo.name}" type=${found_amo.type}` : 'NOT FOUND');

  // Ищем в Kommo поле "Grade recived after demo"
  page = 1;
  let found_kommo = null;
  while (!found_kommo) {
    const r = await get('helloshkolaonlinecom.kommo.com', `/api/v4/leads/custom_fields?limit=50&page=${page}`, KOMMO_TOKEN);
    const fields = r._embedded && r._embedded.custom_fields || [];
    if (!fields.length) break;
    const f = fields.find(f => f.name && f.name.toLowerCase().includes('grade'));
    if (f) { found_kommo = f; break; }
    if (!r._links || !r._links.next) break;
    page++;
  }
  console.log('Kommo field:', found_kommo ? `id=${found_kommo.id} name="${found_kommo.name}" type=${found_kommo.type}` : 'NOT FOUND');
}

main().catch(console.error);
