/**
 * patch_cache_reload_fields.js
 * При обновлении кэша вкладка "Поля" автоматически перезагружает маппинг.
 *
 * PATCH 1 – App.jsx : добавить cacheRefreshKey + useEffect-триггер + передать в FieldSync
 * PATCH 2 – FieldSync.jsx : принять cacheRefreshKey и перезапустить loadAnalysis
 */

const fs = require('fs');
const path = require('path');

const APP   = '/var/www/amoschool/frontend/src/App.jsx';
const FSX   = '/var/www/amoschool/frontend/src/FieldSync.jsx';

let ok = 0;
let fail = 0;

function patch(file, label, search, replace) {
  let src = fs.readFileSync(file, 'utf8');
  if (!src.includes(search)) {
    console.log(`SKIP ${label}: строка не найдена`);
    fail++;
    return;
  }
  fs.writeFileSync(file, src.replace(search, replace), 'utf8');
  console.log(`OK   ${label}`);
  ok++;
}

// ─── PATCH 0: App.jsx — добавить useRef в импорт ────────────────────────────
patch(
  APP,
  '0: useRef в импорт react',
  `import { useState, useEffect, useCallback } from 'react';`,
  `import { useState, useEffect, useCallback, useRef } from 'react';`
);

// ─── PATCH 1а: App.jsx — добавить cacheRefreshKey state рядом с fetchSt ───────
patch(
  APP,
  '1a: cacheRefreshKey state',
  `  // AMO data fetch state (dashboard)
  const [fetchSt, setFetchSt] = useState(null);`,
  `  // AMO data fetch state (dashboard)
  const [fetchSt, setFetchSt] = useState(null);
  // Счётчик обновлений кэша — передаётся в FieldSync для авто-перезагрузки полей
  const [cacheRefreshKey, setCacheRefreshKey] = useState(0);
  const prevFetchStatus = useRef(null);`
);

// ─── PATCH 1б: App.jsx — useEffect-наблюдатель за переходом статуса в 'done' ──
patch(
  APP,
  '1б: useEffect cacheRefreshKey',
  `  // Auto-poll while amo data is loading
  useEffect(() => {
    if (fetchSt?.status !== 'loading') return;`,
  `  // При завершении загрузки кэша — уведомляем FieldSync
  useEffect(() => {
    const prev = prevFetchStatus.current;
    prevFetchStatus.current = fetchSt?.status;
    if (prev === 'loading' && fetchSt?.status === 'done') {
      setCacheRefreshKey(k => k + 1);
    }
  }, [fetchSt?.status]);

  // Auto-poll while amo data is loading
  useEffect(() => {
    if (fetchSt?.status !== 'loading') return;`
);

// ─── PATCH 1в: App.jsx — передать cacheRefreshKey в FieldSync ─────────────────
patch(
  APP,
  '1в: FieldSync получает cacheRefreshKey',
  `        <FieldSync isActive={tab === 'fields'} />`,
  `        <FieldSync isActive={tab === 'fields'} cacheRefreshKey={cacheRefreshKey} />`
);

// ─── PATCH 2а: FieldSync.jsx — принять cacheRefreshKey в пропсах ──────────────
patch(
  FSX,
  '2a: функция FieldSync принимает cacheRefreshKey',
  `export default function FieldSync({ pipelines, isActive = true }) {`,
  `export default function FieldSync({ pipelines, isActive = true, cacheRefreshKey = 0 }) {`
);

// ─── PATCH 2б: FieldSync.jsx — useEffect для перезагрузки при обновлении кэша ─
patch(
  FSX,
  '2б: useEffect cacheRefreshKey → loadAnalysis',
  `  // Авторефреш: перезагружаем анализ, если вкладка стала активной и данные уже были загружены.
  // Это нужно чтобы не показывались устаревшие статусы (например, поля удалены в Kommo).
  useEffect(() => {
    if (isActive && data && !inProgress && !loading) {
      loadAnalysis();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);`,
  `  // Авторефреш: перезагружаем анализ, если вкладка стала активной и данные уже были загружены.
  // Это нужно чтобы не показывались устаревшие статусы (например, поля удалены в Kommo).
  useEffect(() => {
    if (isActive && data && !inProgress && !loading) {
      loadAnalysis();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // Перезагружаем анализ при обновлении кэша (cacheRefreshKey меняется в App.jsx)
  useEffect(() => {
    if (cacheRefreshKey === 0) return; // первый рендер — пропускаем
    loadAnalysis();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheRefreshKey]);`
);

console.log(`\nИтог: ${ok} патч(а) применено, ${fail} пропущено.`);
