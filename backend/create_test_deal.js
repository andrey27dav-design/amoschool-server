/**
 * create_test_deal.js
 * Создаёт тестовую сделку в воронке «ПРОГРЕВ маркетинг МШ» (amo CRM)
 * с 2 контактами, компанией, задачами и комментариями для всех сущностей.
 * Ответственный: Админ (id 6217768)
 */
require('dotenv').config();
const axios = require('./node_modules/axios');
const cfg = require('./src/config');

const AMO = cfg.amo.baseUrl;
const TOKEN = cfg.amo.token;
const h = { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' };

const PIPELINE_ID = 9408314;   // ПРОГРЕВ маркетинг МШ
const STAGE_ID    = 75340146;  // 2 недели
const ADMIN_ID    = 6217768;   // Админ

async function main() {
  const api = axios.create({ baseURL: AMO, headers: h });

  // 1. Создаём компанию
  console.log('1. Создаём компанию...');
  const compR = await api.post('/api/v4/companies', [{ 
    name: 'ТЕСТовая Компания "АйТи-Обучение"',
    responsible_user_id: ADMIN_ID,
    custom_fields_values: [
      { field_code: 'PHONE', values: [{ value: '+79161234567', enum_code: 'WORK' }] },
      { field_code: 'EMAIL', values: [{ value: 'company@test-amo.ru', enum_code: 'WORK' }] },
    ]
  }]);
  const company = compR.data._embedded.companies[0];
  console.log('  Компания создана: id=' + company.id + ' name=' + company.name);

  // 2. Создаём контакт 1
  console.log('2. Создаём контакт 1...');
  const cont1R = await api.post('/api/v4/contacts', [{
    first_name: 'Тест',
    last_name: 'Иванов Иван',
    responsible_user_id: ADMIN_ID,
    custom_fields_values: [
      { field_code: 'PHONE', values: [{ value: '+79161111111', enum_code: 'WORK' }] },
      { field_code: 'EMAIL', values: [{ value: 'ivanov@test-amo.ru', enum_code: 'WORK' }] },
    ]
  }]);
  const contact1 = cont1R.data._embedded.contacts[0];
  console.log('  Контакт 1 создан: id=' + contact1.id + ' name=' + contact1.name);

  // 3. Создаём контакт 2
  console.log('3. Создаём контакт 2...');
  const cont2R = await api.post('/api/v4/contacts', [{
    first_name: 'Тест',
    last_name: 'Петрова Мария',
    responsible_user_id: ADMIN_ID,
    custom_fields_values: [
      { field_code: 'PHONE', values: [{ value: '+79162222222', enum_code: 'WORK' }] },
      { field_code: 'EMAIL', values: [{ value: 'petrova@test-amo.ru', enum_code: 'WORK' }] },
    ]
  }]);
  const contact2 = cont2R.data._embedded.contacts[0];
  console.log('  Контакт 2 создан: id=' + contact2.id + ' name=' + contact2.name);

  // 4. Создаём сделку
  console.log('4. Создаём сделку...');
  const leadR = await api.post('/api/v4/leads', [{
    name: '[ТЕСТ МИГРАЦИИ] Урок английского - Иванов',
    pipeline_id: PIPELINE_ID,
    status_id: STAGE_ID,
    responsible_user_id: ADMIN_ID,
    price: 15000,
    _embedded: {
      contacts: [{ id: contact1.id }, { id: contact2.id }],
      companies: [{ id: company.id }]
    }
  }]);
  const lead = leadR.data._embedded.leads[0];
  console.log('  Сделка создана: id=' + lead.id + ' name=' + lead.name);

  const tomorrow = Math.floor(Date.now() / 1000) + 86400;
  const in3days  = Math.floor(Date.now() / 1000) + 86400 * 3;
  const in7days  = Math.floor(Date.now() / 1000) + 86400 * 7;

  // 5. Задачи для сделки
  console.log('5. Задачи для сделки...');
  await api.post('/api/v4/tasks', [
    { entity_id: lead.id, entity_type: 'leads', text: 'Позвонить клиенту и уточнить расписание занятий', task_type_id: 1, complete_till: tomorrow, responsible_user_id: ADMIN_ID },
    { entity_id: lead.id, entity_type: 'leads', text: 'Отправить программу обучения на почту', task_type_id: 1, complete_till: in3days, responsible_user_id: ADMIN_ID },
  ]);
  console.log('  Задачи сделки созданы');

  // 6. Задачи для контакта 1
  console.log('6. Задачи для контакта 1...');
  await api.post('/api/v4/tasks', [
    { entity_id: contact1.id, entity_type: 'contacts', text: 'Согласовать удобное время для пробного урока', task_type_id: 1, complete_till: in3days, responsible_user_id: ADMIN_ID },
  ]);
  console.log('  Задача контакта 1 создана');

  // 7. Задачи для контакта 2
  console.log('7. Задачи для контакта 2...');
  await api.post('/api/v4/tasks', [
    { entity_id: contact2.id, entity_type: 'contacts', text: 'Уточнить цель изучения языка у контакта 2', task_type_id: 1, complete_till: in7days, responsible_user_id: ADMIN_ID },
  ]);
  console.log('  Задача контакта 2 создана');

  // 8. Задачи для компании
  console.log('8. Задачи для компании...');
  await api.post('/api/v4/tasks', [
    { entity_id: company.id, entity_type: 'companies', text: 'Предложить корпоративный пакет обучения', task_type_id: 1, complete_till: in7days, responsible_user_id: ADMIN_ID },
  ]);
  console.log('  Задача компании создана');

  // 9. Комментарий к сделке
  console.log('9. Комментарий к сделке...');
  await api.post('/api/v4/leads/' + lead.id + '/notes', [{
    note_type: 4,
    params: { text: 'ТЕСТ МИГРАЦИИ: Клиент интересуется курсом английского для взрослых. Хочет начать с пробного урока. Бюджет 15 000 руб/мес.' }
  }]);
  await api.post('/api/v4/leads/' + lead.id + '/notes', [{
    note_type: 4,
    params: { text: 'ТЕСТ МИГРАЦИИ: Согласовано пробное занятие на среду в 18:00. Преподаватель — Анна Г.' }
  }]);
  console.log('  Комментарии сделки созданы');

  // 10. Комментарий к контакту 1
  console.log('10. Комментарий к контакту 1...');
  await api.post('/api/v4/contacts/' + contact1.id + '/notes', [{
    note_type: 4,
    params: { text: 'ТЕСТ МИГРАЦИИ: Иванов Иван — взрослый ученик, уровень A2, работает в IT, хочет бизнес-английский.' }
  }]);
  console.log('  Комментарий контакта 1 создан');

  // 11. Комментарий к контакту 2
  console.log('11. Комментарий к контакту 2...');
  await api.post('/api/v4/contacts/' + contact2.id + '/notes', [{
    note_type: 4,
    params: { text: 'ТЕСТ МИГРАЦИИ: Петрова Мария — ребёнок 12 лет, нужна подготовка к ОГЭ по английскому.' }
  }]);
  console.log('  Комментарий контакта 2 создан');

  // 12. Комментарий к компании
  console.log('12. Комментарий к компании...');
  await api.post('/api/v4/companies/' + company.id + '/notes', [{
    note_type: 4,
    params: { text: 'ТЕСТ МИГРАЦИИ: IT-компания, 30 сотрудников. Интерес к корпоративному обучению английскому.' }
  }]);
  console.log('  Комментарий компании создан');

  console.log('\n=== ТЕСТ-СДЕЛКА СОЗДАНА ===');
  console.log('Lead ID:     ', lead.id);
  console.log('Contact1 ID: ', contact1.id);
  console.log('Contact2 ID: ', contact2.id);
  console.log('Company ID:  ', company.id);
  console.log('\nТеперь: 1) загрузи данные AMO в приложении, 2) запусти перенос через интерфейс.');
}

main().catch(e => {
  if (e.response) {
    console.error('API ERROR', e.response.status, JSON.stringify(e.response.data));
  } else {
    console.error('ERROR:', e.message);
  }
});
