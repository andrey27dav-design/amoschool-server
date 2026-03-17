#!/usr/bin/env node
// patch_field_protection.js
// 1. Backend create-field: блокировка при status 'matched'/'synced' (через status в теле запроса)
// 2. Frontend FieldSync: передавать status в createField, блокировать выбор matched/synced
// 3. Frontend App: диалог подтверждения перед bulk sync-fields
// 4. Frontend App: перезаписать текст ПОМОЩЬ

const fs = require('fs');

// ════════════════════════════════════════════════════════════════
// ПАТЧ 1: Backend — create-field добавляет защиту по status
// ════════════════════════════════════════════════════════════════
{
  const path = '/var/www/amoschool/backend/src/routes/migration.js';
  let raw = fs.readFileSync(path, 'utf8');
  const crlf = raw.includes('\r\n');
  let src = raw.replace(/\r\n/g, '\n');

  const OLD = `router.post('/create-field', async (req, res) => {
  try {
    const { entityType, amoFieldId, stageMapping: stageMappingOverride } = req.body;
    if (!entityType || !amoFieldId) {
      return res.status(400).json({ ok: false, error: 'entityType and amoFieldId required' });
    }`;

  const NEW = `router.post('/create-field', async (req, res) => {
  try {
    const { entityType, amoFieldId, stageMapping: stageMappingOverride, fieldStatus } = req.body;
    if (!entityType || !amoFieldId) {
      return res.status(400).json({ ok: false, error: 'entityType and amoFieldId required' });
    }

    // ── ЗАЩИТА: запрещаем изменение полей с полным совпадением ──────────────
    // Если фронтенд передал статус 'matched' или 'synced' — поле уже есть в Kommo
    // и полностью совпадает. Изменение или пересоздание запрещено.
    if (fieldStatus === 'matched' || fieldStatus === 'synced') {
      logger.warn(\`[create-field] BLOCKED: attempt to modify \${fieldStatus} field \${amoFieldId} (\${entityType})\`);
      return res.status(403).json({
        ok: false,
        blocked: true,
        fieldStatus,
        error: \`⛔ Операция запрещена: поле уже существует в Kommo и полностью совпадает (статус: \${fieldStatus}). Изменение и пересоздание совпадающих полей не допускается.\`,
      });
    }`;

  if (src.includes(OLD)) {
    src = src.replace(OLD, NEW);
    const out = crlf ? src.replace(/\n/g, '\r\n') : src;
    fs.writeFileSync(path, out, 'utf8');
    console.log('OK 1: Backend create-field — защита по fieldStatus добавлена');
  } else {
    console.log('FAIL 1: old pattern not found in migration.js');
  }
}

// ════════════════════════════════════════════════════════════════
// ПАТЧ 2: Frontend api.js — передавать status в createField
// ════════════════════════════════════════════════════════════════
{
  const path = '/var/www/amoschool/frontend/src/api.js';
  let raw = fs.readFileSync(path, 'utf8');
  const crlf = raw.includes('\r\n');
  let src = raw.replace(/\r\n/g, '\n');

  // Ищем текущий вариант createField
  const OLD = `export const createField = (entityType, amoFieldId) =>
  api.post('/migration/create-field', { entityType, amoFieldId }).then(r => r.data);`;
  const NEW = `export const createField = (entityType, amoFieldId, fieldStatus) =>
  api.post('/migration/create-field', { entityType, amoFieldId, fieldStatus }).then(r => r.data);`;

  if (src.includes(OLD)) {
    src = src.replace(OLD, NEW);
    const out = crlf ? src.replace(/\n/g, '\r\n') : src;
    fs.writeFileSync(path, out, 'utf8');
    console.log('OK 2: api.js — createField передаёт fieldStatus');
  } else {
    // Попробуем вариант в одну строку
    const OLD2 = `export const createField = (entityType, amoFieldId) => api.post('/migration/create-field', { entityType, amoFieldId }).then(r => r.data);`;
    const NEW2 = `export const createField = (entityType, amoFieldId, fieldStatus) => api.post('/migration/create-field', { entityType, amoFieldId, fieldStatus }).then(r => r.data);`;
    if (src.includes(OLD2)) {
      src = src.replace(OLD2, NEW2);
      const out = crlf ? src.replace(/\n/g, '\r\n') : src;
      fs.writeFileSync(path, out, 'utf8');
      console.log('OK 2: api.js — createField передаёт fieldStatus (inline)');
    } else {
      console.log('FAIL 2: createField pattern not found in api.js');
      // Print current createField line
      const match = src.match(/.*createField.*/);
      if (match) console.log('  Found:', match[0]);
    }
  }
}

// ════════════════════════════════════════════════════════════════
// ПАТЧ 3: Frontend FieldSync.jsx — всё в одном скрипте:
//   3а. toggleField блокирует matched/synced
//   3б. selectAll исключает matched (уже исключает synced)
//   3в. handleConfirm передаёт fp.status в api.createField
//   3г. handleConfirm: предупреждение о пропущенных matched/synced полях
// ════════════════════════════════════════════════════════════════
{
  const path = '/var/www/amoschool/frontend/src/FieldSync.jsx';
  let raw = fs.readFileSync(path, 'utf8');
  const crlf = raw.includes('\r\n');
  let src = raw.replace(/\r\n/g, '\n');
  let ok3 = 0;

  // 3а. toggleField — блокировать matched/synced
  const OLD3A = `  const toggleField = (fieldPair) => {
    const key = entity + '_' + fieldPair.amo.id;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };`;
  const NEW3A = `  const toggleField = (fieldPair) => {
    // Запрещаем выбор полей с полным совпадением — они не должны создаваться/изменяться
    if (fieldPair.status === 'synced' || fieldPair.status === 'matched') {
      addLog(\`⛔ Поле "\${fieldPair.amo.name}" (\${STATUS_LABELS[fieldPair.status]}) уже существует в Kommo — выбор запрещён.\`);
      return;
    }
    const key = entity + '_' + fieldPair.amo.id;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };`;
  if (src.includes(OLD3A)) { src = src.replace(OLD3A, NEW3A); ok3++; console.log('OK 3а: toggleField — блокировка matched/synced'); }
  else console.log('FAIL 3а: toggleField pattern not found');

  // 3б. selectAll — также исключает matched
  const OLD3B = `  const selectAll = () => {
    const ids = new Set(visibleFields.filter(f => f.status !== 'synced').map(f => entity + '_' + f.amo.id));`;
  const NEW3B = `  const selectAll = () => {
    // Исключаем synced и matched — они уже есть в Kommo и не требуют создания
    const ids = new Set(visibleFields.filter(f => f.status !== 'synced' && f.status !== 'matched').map(f => entity + '_' + f.amo.id));`;
  if (src.includes(OLD3B)) { src = src.replace(OLD3B, NEW3B); ok3++; console.log('OK 3б: selectAll — исключает matched'); }
  else console.log('FAIL 3б: selectAll pattern not found');

  // 3в. handleConfirm — передаёт fp.status + предупреждение о пропущенных
  const OLD3V = `    if (!toCreate.length) {
      addLog('ℹ️ Нет полей для создания (выберите поля со статусом "Нет в Kommo" или "Частично")');
      return;
    }`;
  const NEW3V = `    // Предупреждение о полях, которые уже есть в Kommo и будут пропущены
    const blockedSelected = visibleFields.filter(f => {
      const key = entity + '_' + f.amo.id;
      return selected.has(key) && (f.status === 'synced' || f.status === 'matched');
    });
    if (blockedSelected.length > 0) {
      addLog(\`⛔ ВНИМАНИЕ: \${blockedSelected.length} выбранных полей уже существуют в Kommo (\${STATUS_LABELS['matched']} / \${STATUS_LABELS['synced']}) — они будут пропущены без изменений:\`);
      blockedSelected.forEach(f => addLog(\`   • "\${f.amo.name}" [статус: \${STATUS_LABELS[f.status]}]\`));
    }
    if (!toCreate.length) {
      addLog('ℹ️ Нет полей для создания. Выберите поля со статусом "Нет в Kommo" или "Частично".');
      return;
    }`;
  if (src.includes(OLD3V)) { src = src.replace(OLD3V, NEW3V); ok3++; console.log('OK 3в: handleConfirm — предупреждение + передача статуса'); }
  else console.log('FAIL 3в: handleConfirm pattern not found');

  // 3г. в цикле createField — передать fp.status
  const OLD3G = `        const result = await api.createField(entity, fp.amo.id);`;
  const NEW3G = `        const result = await api.createField(entity, fp.amo.id, fp.status);`;
  if (src.includes(OLD3G)) { src = src.replace(OLD3G, NEW3G); ok3++; console.log('OK 3г: createField — передаёт fp.status'); }
  else console.log('FAIL 3г: api.createField call not found');

  if (ok3 >= 3) {
    const out = crlf ? src.replace(/\n/g, '\r\n') : src;
    fs.writeFileSync(path, out, 'utf8');
    console.log(`FieldSync.jsx сохранён (${ok3}/4 патчей)`);
  } else {
    console.log(`FieldSync.jsx НЕ сохранён (${ok3}/4 патчей — мало)`);
  }
}

// ════════════════════════════════════════════════════════════════
// ПАТЧ 4: Frontend App.jsx — диалог подтверждения bulk sync
// ════════════════════════════════════════════════════════════════
{
  const path = '/var/www/amoschool/frontend/src/App.jsx';
  let raw = fs.readFileSync(path, 'utf8');
  const crlf = raw.includes('\r\n');
  let src = raw.replace(/\r\n/g, '\n');
  let ok4 = 0;

  // 4а. handleSyncFields добавляем подтверждение
  const OLD4A = `  const handleSyncFields = async () => {
    setFieldSyncLoading(true);
    setMessage('');
    try {
      const data = await api.syncFields();`;
  const NEW4A = `  const handleSyncFields = async () => {
    // Предупреждение перед массовым созданием полей
    const confirmed = window.confirm(
      '⚠️ ВНИМАНИЕ\\n\\n' +
      'Функция «Синхронизировать поля» автоматически создаёт в Kommo ВСЕ поля, ' +
      'которых ещё нет в системе.\\n\\n' +
      'Поля, уже существующие в Kommo, изменены не будут.\\n\\n' +
      'Рекомендуется использовать вкладку «Поля» для ручного контроля каждого поля.\\n\\n' +
      'Продолжить автоматическое создание?'
    );
    if (!confirmed) return;
    setFieldSyncLoading(true);
    setMessage('');
    try {
      const data = await api.syncFields();`;
  if (src.includes(OLD4A)) { src = src.replace(OLD4A, NEW4A); ok4++; console.log('OK 4а: handleSyncFields — диалог подтверждения'); }
  else console.log('FAIL 4а: handleSyncFields pattern not found');

  // 4б. Перезаписываем MIGRATION_PLAN и helpOpen modal
  // Находим старый MIGRATION_PLAN
  const OLD4B_START = `const MIGRATION_PLAN = [`;
  const OLD4B_END = `];`;
  const idxStart = src.indexOf(OLD4B_START);
  const idxEnd = idxStart >= 0 ? src.indexOf(OLD4B_END, idxStart) : -1;

  if (idxStart >= 0 && idxEnd >= 0) {
    const oldPlan = src.slice(idxStart, idxEnd + OLD4B_END.length);
    const newPlan = `const MIGRATION_PLAN = [
  { step: 1, title: 'Синхронизация воронок и этапов', desc: 'Перейдите на вкладку «Воронки». Выберите воронку в AMO (левый список) и соответствующую воронку в Kommo (правый список). Нажмите «Синхронизировать этапы». Система построит маппинг между этапами воронок — это необходимо для корректного переноса сделок.' },
  { step: 2, title: 'Анализ и перенос полей', desc: 'Перейдите на вкладку «Поля». Система загрузит и сравнит кастомные поля AMO и Kommo. Поля отображаются по группам со статусами: ✅ Синхронизировано, 🟢 Совпадает, 🟣 Частично, 🔴 Нет в Kommo, ⚠️ Различие.' },
  { step: 3, title: 'Правила работы с полями', desc: 'ЗАПРЕЩЕНО изменять или пересоздавать поля со статусом «Совпадает» или «Синхронизировано» — они уже есть в Kommo. Разрешено: создавать поля «Нет в Kommo» (будут добавлены новые) и дополнять поля «Частично» (в существующее поле добавятся только новые значения списка).' },
  { step: 4, title: 'Создание групп полей в Kommo', desc: 'Если в AMO есть группа полей, которой нет в Kommo — сначала создайте её вручную в Kommo. После этого обновите анализ полей: поля группы появятся со статусом «Нет в Kommo» и их можно будет создать.' },
  { step: 5, title: 'Резервная копия', desc: 'Перед запуском основной миграции создайте резервную копию (раздел «Бэкапы» или автоматически при запуске). Данные AMO сохраняются в JSON-файл на сервере. Исходные данные в AMO не удаляются.' },
  { step: 6, title: 'Перенос компаний, контактов, сделок', desc: 'Используйте кнопки на дашборде в порядке: Компании → Контакты → Сделки → Задачи → Комментарии. Каждая сущность переносится отдельно с сохранением связей.' },
  { step: 7, title: 'Проверка и завершение', desc: 'После переноса проверьте данные в Kommo: карточки сделок, контакты, задачи, таймлайн. Только после ручной проверки — удалите исходные данные в AMO.' },
];`;
    src = src.slice(0, idxStart) + newPlan + src.slice(idxEnd + OLD4B_END.length);
    ok4++;
    console.log('OK 4б: MIGRATION_PLAN перезаписан');
  } else {
    console.log('FAIL 4б: MIGRATION_PLAN not found');
  }

  // 4в. Перезаписываем helpOpen modal body
  const OLD4C = `            <div className="modal-body">
              <div className="plan-intro">
                Перенос данных из <strong>amo CRM</strong> (воронка «Школа/Репетиторство»)
                в <strong>Kommo CRM</strong> (воронка «RUSSIANLANGUADGE DEPARTMENT»).
                Исходные данные сохраняются — ничего не удаляется автоматически.
              </div>
              <div className="plan-warning">
                ⚠️ Перед запуском убедитесь, что этапы воронки синхронизированы (шаг 1).
              </div>
              <ol className="plan-steps">
                {MIGRATION_PLAN.map(({ step, title, desc }) => (
                  <li key={step} className="plan-step">
                    <div className="plan-step-title">Шаг {step}: {title}</div>
                    <div className="plan-step-desc">{desc}</div>
                  </li>
                ))}
              </ol>
              <div className="plan-section">
                <h3>🔙 Откат данных</h3>
                <p>Если что-то пошло не так — используйте кнопки отката на дашборде. Можно откатить всё или только отдельные сущности (сделки, контакты, компании). Откат удаляет только записи, созданные в Kommo CRM в ходе этой миграции.</p>
              </div>
              <div className="plan-section">
                <h3>✅ После успешной миграции</h3>
                <ol>
                  <li>Проверьте данные в Kommo CRM — убедитесь, что все сделки, контакты и задачи на месте.</li>
                  <li>Проверьте таймлайн нескольких карточек — комментарии должны присутствовать.</li>
                  <li>Убедитесь в корректности этапов воронки.</li>
                  <li>Только после проверки вручную удалите исходные данные в amo CRM.</li>
                </ol>
              </div>
            </div>`;

  const NEW4C = `            <div className="modal-body">
              <div className="plan-intro">
                Инструмент переноса данных из <strong>AMO CRM</strong> в <strong>Kommo CRM</strong>.
                Исходные данные сохраняются — ничего не удаляется автоматически.
              </div>

              <div className="plan-section">
                <h3>🔀 Часть 1: Копирование воронки с этапами</h3>
                <ol className="plan-steps">
                  <li className="plan-step">
                    <div className="plan-step-title">Перейдите на вкладку «Воронки»</div>
                    <div className="plan-step-desc">В левом списке (AMO CRM) выберите воронку-источник. В правом списке (Kommo CRM) выберите целевую воронку.</div>
                  </li>
                  <li className="plan-step">
                    <div className="plan-step-title">Нажмите «Синхронизировать этапы»</div>
                    <div className="plan-step-desc">Система сопоставит этапы выбранных воронок и сохранит маппинг. Это необходимо для корректного переноса сделок. ⚠️ Этапы воронки в Kommo должны быть созданы вручную заранее.</div>
                  </li>
                  <li className="plan-step">
                    <div className="plan-step-title">Проверьте результат</div>
                    <div className="plan-step-desc">Убедитесь, что все этапы правильно сопоставлены. При необходимости исправьте маппинг и повторите синхронизацию.</div>
                  </li>
                </ol>
              </div>

              <div className="plan-section">
                <h3>🗂 Часть 2: Копирование групп полей с кастомными полями</h3>
                <ol className="plan-steps">
                  <li className="plan-step">
                    <div className="plan-step-title">Создайте группы полей в Kommo вручную</div>
                    <div className="plan-step-desc">Перейдите в настройки Kommo → Поля → Создайте группы с теми же названиями, что в AMO. Без созданной группы поля в неё не будут добавлены.</div>
                  </li>
                  <li className="plan-step">
                    <div className="plan-step-title">Перейдите на вкладку «Поля»</div>
                    <div className="plan-step-desc">Система сравнит поля AMO и Kommo. Статусы: ✅ Синхронизировано — подтверждено и совпадает; 🟢 Совпадает — поле найдено в Kommo, изменений не требует; 🟣 Частично — поле есть, но не хватает значений; 🔴 Нет в Kommo — поле нужно создать; ⚠️ Различие — тип или структура отличается.</div>
                  </li>
                  <li className="plan-step">
                    <div className="plan-step-title">Выберите поля для создания</div>
                    <div className="plan-step-desc">Отметьте поля со статусом «Нет в Kommo» (🔴) или «Частично» (🟣). Поля со статусом «Совпадает» (🟢) выбрать нельзя — они уже есть в Kommo.</div>
                  </li>
                  <li className="plan-step">
                    <div className="plan-step-title">Нажмите «Подтвердить»</div>
                    <div className="plan-step-desc">«Нет в Kommo» — создаётся новое поле. «Частично» — в существующее поле добавляются только недостающие значения. Существующие данные в Kommo не изменяются.</div>
                  </li>
                  <li className="plan-step">
                    <div className="plan-step-title">Обновите анализ и проверьте</div>
                    <div className="plan-step-desc">После создания полей нажмите «Обновить» — созданные поля должны получить статус «Синхронизировано» ✅.</div>
                  </li>
                </ol>
                <div className="plan-warning" style={{marginTop: 12}}>
                  ⛔ <strong>Запрещено:</strong> изменять и пересоздавать поля, которые уже совпадают в Kommo. Система автоматически блокирует такие операции и выводит предупреждение.
                </div>
              </div>

              <div className="plan-section">
                <h3>📦 Часть 3: Перенос данных (сделки, контакты, задачи)</h3>
                <ol className="plan-steps">
                  <li className="plan-step">
                    <div className="plan-step-title">Создайте резервную копию</div>
                    <div className="plan-step-desc">Вкладка «Бэкапы» → создайте резервную копию данных AMO перед запуском миграции.</div>
                  </li>
                  <li className="plan-step">
                    <div className="plan-step-title">Выполните перенос в порядке</div>
                    <div className="plan-step-desc">Компании → Контакты → Сделки → Задачи → Комментарии. Каждая сущность переносится отдельно с сохранением связей.</div>
                  </li>
                  <li className="plan-step">
                    <div className="plan-step-title">Проверьте данные в Kommo</div>
                    <div className="plan-step-desc">Убедитесь, что все карточки, поля, задачи и таймлайн на месте. Только после ручной проверки удалите исходные данные в AMO.</div>
                  </li>
                </ol>
              </div>

              <div className="plan-section">
                <h3>🔙 Откат данных</h3>
                <p>Если что-то пошло не так — используйте кнопки отката на дашборде. Можно откатить только записи, созданные в ходе этой миграции. Исходные данные AMO не затрагиваются.</p>
              </div>
            </div>`;

  if (src.includes(OLD4C)) {
    src = src.replace(OLD4C, NEW4C);
    ok4++;
    console.log('OK 4в: modal ПОМОЩЬ — инструкция перезаписана');
  } else {
    console.log('FAIL 4в: modal body pattern not found');
  }

  if (ok4 >= 2) {
    const out = crlf ? src.replace(/\n/g, '\r\n') : src;
    fs.writeFileSync(path, out, 'utf8');
    console.log(`App.jsx сохранён (${ok4}/3 патчей)`);
  } else {
    console.log(`App.jsx НЕ сохранён (${ok4}/3 патчей — мало)`);
  }
}

console.log('\nВсе патчи завершены.');
