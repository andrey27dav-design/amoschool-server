/**
 * patch_cache_crlf.js
 * Применяет патчи 1а и 1б для App.jsx с учётом CRLF окончаний строк.
 */
const fs = require('fs');
const APP = '/var/www/amoschool/frontend/src/App.jsx';

let src = fs.readFileSync(APP, 'utf8');
let ok = 0;

// PATCH 1а: добавить cacheRefreshKey state и prevFetchStatus ref
const target1a = '  // AMO data fetch state (dashboard)\r\n  const [fetchSt, setFetchSt] = useState(null);';
const replace1a = `  // AMO data fetch state (dashboard)\r\n  const [fetchSt, setFetchSt] = useState(null);\r\n  // Счётчик обновлений кэша — передаётся в FieldSync для авто-перезагрузки полей\r\n  const [cacheRefreshKey, setCacheRefreshKey] = useState(0);\r\n  const prevFetchStatus = useRef(null);`;

if (src.includes(target1a)) {
  src = src.replace(target1a, replace1a);
  console.log('OK   1а: cacheRefreshKey state добавлен');
  ok++;
} else {
  console.log('FAIL 1а: строка не найдена');
}

// PATCH 1б: добавить useEffect-наблюдатель перед polling useEffect
const target1b = `  // Auto-poll while amo data is loading\r\n  useEffect(() => {\r\n    if (fetchSt?.status !== 'loading') return;`;
const replace1b = `  // При завершении загрузки кэша — уведомляем FieldSync о необходимости перезагрузить маппинг\r\n  useEffect(() => {\r\n    const prev = prevFetchStatus.current;\r\n    prevFetchStatus.current = fetchSt?.status;\r\n    if (prev === 'loading' && fetchSt?.status === 'done') {\r\n      setCacheRefreshKey(k => k + 1);\r\n    }\r\n  }, [fetchSt?.status]);\r\n\r\n  // Auto-poll while amo data is loading\r\n  useEffect(() => {\r\n    if (fetchSt?.status !== 'loading') return;`;

if (src.includes(target1b)) {
  src = src.replace(target1b, replace1b);
  console.log('OK   1б: useEffect cacheRefreshKey добавлен');
  ok++;
} else {
  console.log('FAIL 1б: строка не найдена — ищем альтернативный вариант...');
  // Try LF variant
  const target1b_lf = `  // Auto-poll while amo data is loading\n  useEffect(() => {\n    if (fetchSt?.status !== 'loading') return;`;
  if (src.includes(target1b_lf)) {
    const replace1b_lf = `  // При завершении загрузки кэша — уведомляем FieldSync о необходимости перезагрузить маппинг\n  useEffect(() => {\n    const prev = prevFetchStatus.current;\n    prevFetchStatus.current = fetchSt?.status;\n    if (prev === 'loading' && fetchSt?.status === 'done') {\n      setCacheRefreshKey(k => k + 1);\n    }\n  }, [fetchSt?.status]);\n\n  // Auto-poll while amo data is loading\n  useEffect(() => {\n    if (fetchSt?.status !== 'loading') return;`;
    src = src.replace(target1b_lf, replace1b_lf);
    console.log('OK   1б (LF): useEffect cacheRefreshKey добавлен');
    ok++;
  } else {
    console.log('FAIL 1б: не удалось найти строку ни в CRLF, ни в LF формате');
  }
}

fs.writeFileSync(APP, src, 'utf8');
console.log(`\nИтог: ${ok} патч(а) применено.`);
