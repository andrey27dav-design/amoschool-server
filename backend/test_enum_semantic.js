// Быстрая проверка семантического матчинга enum-значений
const amoApi = require('./src/services/amoApi');
const kommoApi = require('./src/services/kommoApi');

(async () => {
  const [amoC, kommoC] = await Promise.all([
    amoApi.getCustomFields('contacts'),
    kommoApi.getCustomFields('contacts'),
  ]);

  const pol = amoC.find(f => f.name === 'Пол');
  const mf = kommoC.find(f => f.name === 'Male/Female');
  const rol = amoC.find(f => f.name === 'Роль');
  const rel = kommoC.find(f => f.name === 'Relationship to the student');

  console.log('AMO "Пол":', pol?.enums?.map(e => e.value));
  console.log('Kommo "Male/Female":', mf?.enums?.map(e => e.value));
  console.log('AMO "Роль":', rol?.enums?.map(e => e.value));
  console.log('Kommo "Relationship":', rel?.enums?.map(e => e.value));

  const http = require('http');
  // Запрос analysis
  await new Promise(resolve => {
    http.get({ hostname: 'localhost', port: 3008, path: '/api/migration/fields-analysis' }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const a = JSON.parse(data);
        const contacts = a.entities?.contacts?.groups || [];
        console.log('\n═══ Контакты — статусы ═══');
        contacts.forEach(g => {
          g.fields?.forEach(fp => {
            if (!fp.kommo) return;
            const aName = fp.amo?.name;
            const kName = fp.kommo?.name;
            if (['Пол','Роль','Ученик','Квалифицирован'].includes(aName)) {
              console.log(`  "${aName}" → "${kName}" | статус: ${fp.status} | missing: ${fp.missingCount || 0} | via: ${fp.matchedVia}`);
            }
          });
        });
        resolve();
      });
    }).on('error', e => { console.error(e.message); resolve(); });
  });
})().catch(e => console.error(e.message));
