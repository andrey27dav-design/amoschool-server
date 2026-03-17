#!/usr/bin/env node
// patch_frontend_statusfilter.js
// Патч FieldSync.jsx:
// 1. Добавляет state statusFilter
// 2. Кликабельные цифры в сводке — фильтруют список по статусу
// 3. Фильтрация по statusFilter в getVisibleFields
// 4. Сброс statusFilter при смене сущности
// Запускать на сервере: node /var/www/amoschool/patch_frontend_statusfilter.js

const fs = require('fs');
const filePath = '/var/www/amoschool/frontend/src/FieldSync.jsx';
let src = fs.readFileSync(filePath, 'utf8');
let ok = 0;

// ── 1. Добавить state statusFilter ──────────────────────────────────────────
const old1 = `  const [showSynced, setShowSynced] = useState(true); // показывать уже синхронизированные`;

if (!src.includes('statusFilter')) {
  if (src.includes(old1)) {
    src = src.replace(old1,
`  const [showSynced, setShowSynced] = useState(true); // показывать уже синхронизированные
  const [statusFilter, setStatusFilter] = useState(null); // фильтр по клику на сводке (null = все)`
    );
    console.log('OK 1: state statusFilter добавлен');
    ok++;
  } else {
    // fallback — ищем без точных пробелов
    const re1 = /const \[showSynced, setShowSynced\] = useState\(true\);[^\n]*/;
    if (re1.test(src)) {
      src = src.replace(re1, (m) => m + '\n  const [statusFilter, setStatusFilter] = useState(null); // фильтр по клику на сводке');
      console.log('OK 1 (regex): state statusFilter добавлен');
      ok++;
    } else {
      console.log('FAIL 1: строка showSynced не найдена');
    }
  }
} else {
  console.log('SKIP 1: statusFilter уже объявлен');
  ok++;
}

// ── 2. Сброс statusFilter при смене сущности ────────────────────────────────
const old2 = `    localStorage.setItem('fsync_entity', entity);
    setGroupFilter('all'); // При смене сущности сбрасываем фильтр групп`;

if (!src.includes('setStatusFilter(null)')) {
  if (src.includes(old2)) {
    src = src.replace(old2,
`    localStorage.setItem('fsync_entity', entity);
    setGroupFilter('all'); // При смене сущности сбрасываем фильтр групп
    setStatusFilter(null); // Сбрасываем фильтр статуса`
    );
    console.log('OK 2: сброс statusFilter при смене сущности');
    ok++;
  } else {
    console.log('FAIL 2: строка setGroupFilter(all) не найдена');
  }
} else {
  console.log('SKIP 2: setStatusFilter(null) уже есть');
  ok++;
}

// ── 3. Фильтр в getVisibleFields ─────────────────────────────────────────────
const old3 = `        // Скрывать синхронизированные если выключен показ
        if (fieldPair.status === 'synced' && !showSynced) continue;
        results.push({ ...fieldPair, groupId: group.id, groupName: group.name });`;

const new3 = `        // Скрывать синхронизированные если выключен показ
        if (fieldPair.status === 'synced' && !showSynced) continue;
        // Фильтр по клику на сводке
        if (statusFilter && fieldPair.status !== statusFilter) continue;
        results.push({ ...fieldPair, groupId: group.id, groupName: group.name });`;

if (!src.includes('statusFilter && fieldPair.status')) {
  if (src.includes(old3)) {
    src = src.replace(old3, new3);
    console.log('OK 3: фильтр statusFilter в getVisibleFields');
    ok++;
  } else {
    console.log('FAIL 3: паттерн showSynced continue не найден');
  }
} else {
  console.log('SKIP 3: фильтр уже есть');
  ok++;
}

// ── 4. Добавить statusFilter в dep-array useCallback ────────────────────────
const old4 = `  }, [data, entity, typeFilter, groupFilter, search, showSynced]);`;
const new4 = `  }, [data, entity, typeFilter, groupFilter, search, showSynced, statusFilter]);`;

if (!src.includes('statusFilter]);')) {
  if (src.includes(old4)) {
    src = src.replace(old4, new4);
    console.log('OK 4: statusFilter добавлен в dep-array useCallback');
    ok++;
  } else {
    console.log('FAIL 4: dep-array getVisibleFields не найден');
  }
} else {
  console.log('SKIP 4: statusFilter уже в dep-array');
  ok++;
}

// ── 5. Кликабельная сводка ───────────────────────────────────────────────────
const oldSummary = `      {summary && (
        <div className="fs-summary">
          <div className="fs-sum-item fs-sum-total">
            <span className="fs-sum-val">{summary.total}</span>
            <span className="fs-sum-lbl">Всего</span>
          </div>
          <div className="fs-sum-item fs-sum-synced">
            <span className="fs-sum-val">{summary.synced}</span>
            <span className="fs-sum-lbl">✅ Синхронизировано</span>
          </div>
          <div className="fs-sum-item fs-sum-matched">
            <span className="fs-sum-val">{summary.matched}</span>
            <span className="fs-sum-lbl">🟢 Совпадает</span>
          </div>
          <div className="fs-sum-item fs-sum-missing">
            <span className="fs-sum-val">{summary.missing}</span>
            <span className="fs-sum-lbl">🟡 Нет в Kommo</span>
          </div>
          <div className="fs-sum-item fs-sum-different">
            <span className="fs-sum-val">{summary.different}</span>
            <span className="fs-sum-lbl">🔴 Отличается</span>
          </div>
          {summary.partial > 0 && (
            <div className="fs-sum-item fs-sum-partial">
              <span className="fs-sum-val">{summary.partial}</span>
              <span className="fs-sum-lbl">🟣 Частично</span>
            </div>
          )}
          {summary.skipped > 0 && (
            <div className="fs-sum-item fs-sum-skipped">
              <span className="fs-sum-val">{summary.skipped}</span>
              <span className="fs-sum-lbl">⏭ Пропущено</span>
            </div>
          )}
        </div>
      )}`;

const newSummary = `      {summary && (
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

if (!src.includes('fs-sum-active')) {
  if (src.includes(oldSummary)) {
    src = src.replace(oldSummary, newSummary);
    console.log('OK 5: кликабельная сводка заменена');
    ok++;
  } else {
    console.log('FAIL 5: паттерн сводки не найден');
    const diagIdx = src.indexOf('fs-sum-synced');
    if (diagIdx >= 0) console.log('  Контекст:', JSON.stringify(src.substring(diagIdx - 50, diagIdx + 100)));
  }
} else {
  console.log('SKIP 5: кликабельная сводка уже есть');
  ok++;
}

fs.writeFileSync(filePath, src, 'utf8');
console.log('\nГотово:', ok, '/ 5 изменений применено');
