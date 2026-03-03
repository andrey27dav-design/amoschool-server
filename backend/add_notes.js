require('dotenv').config();
const axios = require('./node_modules/axios');
const cfg = require('./src/config');
const AMO = cfg.amo.baseUrl;
const h = { Authorization: 'Bearer ' + cfg.amo.token, 'Content-Type': 'application/json' };
const a = axios.create({ baseURL: AMO, headers: h });

const LEAD_ID = 31652221;
const CONT1_ID = 32209887;
const CONT2_ID = 32209889;
const COMP_ID = 32209885;

async function main() {
  // Notes for lead
  await a.post('/api/v4/leads/' + LEAD_ID + '/notes', [{ note_type: 'common', params: { text: 'ТЕСТ МИГРАЦИИ: Клиент интересуется курсом английского. Бюджет 15 000 руб/мес.' } }]);
  await a.post('/api/v4/leads/' + LEAD_ID + '/notes', [{ note_type: 'common', params: { text: 'ТЕСТ МИГРАЦИИ: Согласовано пробное занятие на среду 18:00. Преподаватель Анна Г.' } }]);
  console.log('Lead notes done');

  await a.post('/api/v4/contacts/' + CONT1_ID + '/notes', [{ note_type: 'common', params: { text: 'ТЕСТ МИГРАЦИИ: Иванов — взрослый, A2, хочет бизнес-английский.' } }]);
  console.log('Contact1 note done');

  await a.post('/api/v4/contacts/' + CONT2_ID + '/notes', [{ note_type: 'common', params: { text: 'ТЕСТ МИГРАЦИИ: Петрова — ребёнок 12 лет, подготовка к ОГЭ.' } }]);
  console.log('Contact2 note done');

  await a.post('/api/v4/companies/' + COMP_ID + '/notes', [{ note_type: 'common', params: { text: 'ТЕСТ МИГРАЦИИ: IT-компания, 30 сотрудников, корп. обучение.' } }]);
  console.log('Company note done');

  console.log('All notes created!');
}
main().catch(e => { if(e.response) console.error(e.response.status, JSON.stringify(e.response.data)); else console.error(e.message); });
