#!/usr/bin/env node
// patch_frontend_statusfilter_v2.js — работает с CRLF-файлами
// Применяет изменения через regex с учётом \r\n
// node /var/www/amoschool/patch_frontend_statusfilter_v2.js

const fs = require('fs');
const filePath = '/var/www/amoschool/frontend/src/FieldSync.jsx';

// Читаем как есть, нормализуем к LF для поиска, в конце вернём CRLF
const rawSrc = fs.readFileSync(filePath, 'utf8');
const hasCRLF = rawSrc.includes('\r\n');
let src = rawSrc.replace(/\r\n/g, '\n');
let ok = 0;

// Функция safe replace: ищет строку и заменяет
function tryReplace(label, from, to) {
  if (src.includes(from)) {
    src = src.replace(from, to);
    console.log('OK:', label);
    ok++;
    return true;
  }
  console.log('FAIL:', label);
  return false;
}

// ── 1. Добавить state statusFilter ──
if (!src.includes('statusFilter')) {
  tryReplace(
    'state statusFilter',
    `  const [showSynced, setShowSynced] = useState(true); // показывать уже синхронизированные`,
    `  const [showSynced, setShowSynced] = useState(true); // показывать уже синхронизированные
  const [statusFilter, setStatusFilter] = useState(null); // фильтр по клику на сводке`
  );
} else {
  console.log('SKIP: statusFilter уже объявлен'); ok++;
}

// ── 2. Сброс statusFilter при смене сущности ──
if (!src.includes('setStatusFilter(null)')) {
  tryReplace(
    'сброс statusFilter при смене сущности',
    `    setGroupFilter('all'); // При смене сущности сбрасываем фильтр групп`,
    `    setGroupFilter('all'); // При смене сущности сбрасываем фильтр групп
    setStatusFilter(null); // Сбрасываем фильтр статуса`
  );
} else {
  console.log('SKIP: setStatusFilter(null) уже есть'); ok++;
}

// ── 3. Фильтр в getVisibleFields ──
if (!src.includes('statusFilter && fieldPair.status')) {
  tryReplace(
    'фильтр statusFilter в getVisibleFields',
    `        // Скрывать синхронизированные если выключен показ\n        if (fieldPair.status === 'synced' && !showSynced) continue;\n        results.push({ ...fieldPair, groupId: group.id, groupName: group.name });`,
    `        // Скрывать синхронизированные если выключен показ\n        if (fieldPair.status === 'synced' && !showSynced) continue;\n        // Фильтр по клику на сводке\n        if (statusFilter && fieldPair.status !== statusFilter) continue;\n        results.push({ ...fieldPair, groupId: group.id, groupName: group.name });`
  );
} else {
  console.log('SKIP: фильтр уже есть'); ok++;
}

// ── 4. dep-array useCallback ──
if (!src.includes('statusFilter]);')) {
  tryReplace(
    'statusFilter в dep-array',
    `  }, [data, entity, typeFilter, groupFilter, search, showSynced]);`,
    `  }, [data, entity, typeFilter, groupFilter, search, showSynced, statusFilter]);`
  );
} else {
  console.log('SKIP: statusFilter уже в dep-array'); ok++;
}

// ── 5. Кликабельная сводка ──
// Ищем через regex чтобы обойти точные пробелы/отступы
if (!src.includes('fs-sum-active')) {
  const summaryRe = /\{summary && \(\s*<div className="fs-summary">[\s\S]*?<\/div>\s*\)\}/;
  const m = summaryRe.exec(src);
  if (m) {
    const newSummary = `{summary && (
        <div className="fs-summary">
          {/* Всего — сбрасывает фильтр */}
          <div
            className={\`fs-sum-item fs-sum-total\${statusFilter === null ? ' fs-sum-active' : ''}\`}
            onClick={() => setStatusFilter(null)}
            title="Показать все поля"
          >
            <span className="fs-sum-val">{summary.total}</span>
            <span className="fs-sum-lbl">Всего</span>
          </div>
          {summary.synced > 0 && (
            <div
              className={\`fs-sum-item fs-sum-synced\${statusFilter === 'synced' ? ' fs-sum-active' : ''}\`}
              onClick={() => setStatusFilter(f => f === 'synced' ? null : 'synced')}
              title="Нажмите, чтобы показать только синхронизированные"
            >
              <span className="fs-sum-val">{summary.synced}</span>
              <span className="fs-sum-lbl">✅ Синхронизировано</span>
            </div>
          )}
          {summary.matched > 0 && (
            <div
              className={\`fs-sum-item fs-sum-matched\${statusFilter === 'matched' ? ' fs-sum-active' : ''}\`}
              onClick={() => setStatusFilter(f => f === 'matched' ? null : 'matched')}
              title="Нажмите, чтобы показать только совпадающие"
            >
              <span className="fs-sum-val">{summary.matched}</span>
              <span className="fs-sum-lbl">🟢 Совпадает</span>
            </div>
          )}
          <div
            className={\`fs-sum-item fs-sum-missing\${statusFilter === 'missing' ? ' fs-sum-active' : ''}\`}
            onClick={() => setStatusFilter(f => f === 'missing' ? null : 'missing')}
            title="Нажмите, чтобы показать только отсутствующие"
          >
            <span className="fs-sum-val">{summary.missing}</span>
            <span className="fs-sum-lbl">🟡 Нет в Kommo</span>
          </div>
          <div
            className={\`fs-sum-item fs-sum-different\${statusFilter === 'different' ? ' fs-sum-active' : ''}\`}
            onClick={() => setStatusFilter(f => f === 'different' ? null : 'different')}
            title="Нажмите, чтобы показать только отличающиеся"
          >
            <span className="fs-sum-val">{summary.different}</span>
            <span className="fs-sum-lbl">🔴 Отличается</span>
          </div>
          {summary.partial > 0 && (
            <div
              className={\`fs-sum-item fs-sum-partial\${statusFilter === 'partial' ? ' fs-sum-active' : ''}\`}
              onClick={() => setStatusFilter(f => f === 'partial' ? null : 'partial')}
              title="Нажмите, чтобы показать только частичные совпадения"
            >
              <span className="fs-sum-val">{summary.partial}</span>
              <span className="fs-sum-lbl">🟣 Частично</span>
            </div>
          )}
          {summary.skipped > 0 && (
            <div
              className={\`fs-sum-item fs-sum-skipped\${statusFilter === 'skipped' ? ' fs-sum-active' : ''}\`}
              onClick={() => setStatusFilter(f => f === 'skipped' ? null : 'skipped')}
              title="Нажмите, чтобы показать только пропущенные"
            >
              <span className="fs-sum-val">{summary.skipped}</span>
              <span className="fs-sum-lbl">⏭ Пропущено</span>
            </div>
          )}
          {statusFilter && (
            <button
              className="fs-sum-clear-filter"
              onClick={() => setStatusFilter(null)}
              title="Сбросить фильтр"
            >✕ Сбросить фильтр</button>
          )}
        </div>
      )}`;
    src = src.slice(0, m.index) + newSummary + src.slice(m.index + m[0].length);
    console.log('OK: кликабельная сводка заменена (regex)');
    ok++;
  } else {
    console.log('FAIL: секция summary не найдена даже через regex');
    const d = src.indexOf('fs-summary');
    if (d >= 0) console.log('  Контекст:', JSON.stringify(src.substring(d - 20, d + 100)));
  }
} else {
  console.log('SKIP: кликабельная сводка уже есть'); ok++;
}

// Записываем обратно с тем же форматом строк
const out = hasCRLF ? src.replace(/\n/g, '\r\n') : src;
fs.writeFileSync(filePath, out, 'utf8');
console.log('\nГотово:', ok, '/ 5 изменений применено');
