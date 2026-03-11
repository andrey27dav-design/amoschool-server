// V1.6.25: Update help instructions with auto-run, countdown, STOP features
const fs = require('fs');
const appPath = '/var/www/amoschool/frontend/src/App.jsx';
let app = fs.readFileSync(appPath, 'utf8');
const orig = app;

// Add new section about AUTO RUN after the "Пакетный перенос" block
// Insert before {/* ── ТОНКИЙ ПЕРЕНОС */}
const autoRunBlock = `
              {/* ── АВТОМАТИЧЕСКИЙ ПЕРЕНОС ────────────────────────── */}
              <div className="plan-guide-block green">
                <h3>🚀 Автоматический перенос (Авто ВСЁ)</h3>
                <ol>
                  <li>
                    <strong>Выберите размер пакета</strong> — рекомендуется 200 для оптимальной скорости.
                  </li>
                  <li>
                    <strong>Нажмите «🔄 Авто ВСЁ»</strong> — система автоматически перенесёт все сделки пакетами.
                    <br/><em>После каждого пакета — пауза 60 секунд (обратный отсчёт на экране), затем следующий пакет запускается автоматически.</em>
                  </li>
                  <li>
                    <strong>Обратный отсчёт 60 → 0</strong> — показывается зелёным баннером между пакетами.
                    Это время нужно для стабильности API. Счётчик тикает на клиенте — <strong>не закрывайте вкладку браузера</strong>.
                  </li>
                  <li>
                    <strong>Кнопка «⏹ СТОП»</strong> — останавливает автоматический перенос после завершения текущего пакета.
                    Уже перенесённые данные сохраняются. Можно продолжить позже нажав «🔄 Авто ВСЁ» снова.
                  </li>
                </ol>
                <p style={{color:'#64748b',fontSize:'13px',marginTop:'6px'}}>
                  ⚠️ <strong>Важно:</strong> Если вы закроете/обновите вкладку браузера во время паузы между пакетами,
                  обратный отсчёт остановится. Просто откройте страницу снова — отсчёт продолжится автоматически.
                </p>
              </div>

`;

app = app.replace(
  '              {/* ── ТОНКИЙ ПЕРЕНОС',
  autoRunBlock + '              {/* ── ТОНКИЙ ПЕРЕНОС'
);

// Add STOP and Авто ВСЁ to the table of controls
app = app.replace(
  `                    <tr><td>«⏸ Пауза»</td><td>Остановить после текущей сделки</td><td>Нужно прервать</td></tr>`,
  `                    <tr><td>«⏸ Пауза»</td><td>Остановить после текущей сделки</td><td>Нужно прервать</td></tr>
                    <tr><td>«🔄 Авто ВСЁ»</td><td>Автоматически перенести все оставшиеся сделки пакетами с паузой 60 сек</td><td>Основной режим массового переноса</td></tr>
                    <tr><td>«⏹ СТОП»</td><td>Остановить авто-перенос после текущего пакета</td><td>Нужно прервать авто-перенос</td></tr>
                    <tr><td>«▶ Продолжить пакет»</td><td>Возобновить перенос после сбоя/паузы</td><td>После ошибки или перезагрузки сервера</td></tr>`
);

// Update cheat sheet with auto mode
app = app.replace(
  `                <div><span style={{color:'#f87171'}}>Что-то не так:</span> <span style={{color:'#e2e8f0'}}>нажать «Перенести» снова — продолжит без дублей</span></div>`,
  `                <div><span style={{color:'#34d399'}}>Авто-перенос:</span> <span style={{color:'#e2e8f0'}}>«Авто ВСЁ» → ждать → все пакеты перенесутся автоматически</span></div>
                <div><span style={{color:'#f87171'}}>Что-то не так:</span> <span style={{color:'#e2e8f0'}}>нажать «Перенести» снова — продолжит без дублей</span></div>`
);

if (app === orig) {
  console.error('ERROR: No changes made!');
  process.exit(1);
}

fs.writeFileSync(appPath, app, 'utf8');
console.log('OK: Help instructions updated with auto-run features');

// Update versions
const versionsPath = '/var/www/amoschool/backend/src/versions.js';
let versions = fs.readFileSync(versionsPath, 'utf8');
versions = versions.replace(
  "const VERSIONS = [\n  {",
  `const VERSIONS = [
  {
    version: 'V1.6.25',
    date: '2026-03-10',
    title: 'Обновлена инструкция (ПОМОЩЬ)',
    changes: [
      'Добавлено описание автоматического переноса (Авто ВСЁ) с обратным отсчётом',
      'Добавлены кнопки СТОП, Продолжить пакет в таблицу элементов управления',
      'Добавлена шпаргалка по авто-переносу',
      'Предупреждение о необходимости не закрывать вкладку браузера во время авто-переноса',
    ],
  },
  {`
);
fs.writeFileSync(versionsPath, versions, 'utf8');
console.log('OK: V1.6.25 version added');
