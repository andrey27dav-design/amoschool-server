// run_batch_test.js — тестовый пакетный перенос сделки #27212311
const fse   = require('fs-extra');
const axios = require('axios');

const BCFG = '/var/www/amoschool/backend/backups/batch_config.json';
const ORIG  = fse.readJsonSync(BCFG);

console.log('=== Сохранённый batch_config (оригинал) ===');
console.log(JSON.stringify(ORIG, null, 2));

// Временно выставляем offset=77, batchSize=1
const testCfg = { ...ORIG, offset: 77, batchSize: 1 };
fse.writeJsonSync(BCFG, testCfg, { spaces: 2 });
console.log('\n✅ batch_config временно изменён: offset=77, batchSize=1');

async function run() {
  try {
    console.log('\n🚀 Запускаем POST /api/migration/batch-start ...');
    const resp = await axios.post('http://localhost:3008/api/migration/batch-start', {});
    console.log('\n=== Результат пакетного переноса ===');
    console.log(JSON.stringify(resp.data, null, 2));
  } catch(e) {
    console.error('Ошибка запроса:', e.response ? JSON.stringify(e.response.data) : e.message);
  } finally {
    // Восстанавливаем оригинал
    fse.writeJsonSync(BCFG, ORIG, { spaces: 2 });
    console.log('\n✅ batch_config восстановлен: offset=' + ORIG.offset + ', batchSize=' + ORIG.batchSize);
  }
}

run();
