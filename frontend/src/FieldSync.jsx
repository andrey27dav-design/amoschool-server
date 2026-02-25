/**
 * FieldSync.jsx
 * Вкладка "Синхронизация полей" — визуальное сравнение и перенос
 * кастомных полей из AMO CRM в Kommo CRM.
 *
 * Функционал:
 * - Загрузка и сравнение полей из обоих аккаунтов
 * - Группировка по сущностям и группам полей
 * - Визуальный предпросмотр каждого типа поля
 * - Выбор полей для переноса, Подтвердить / Пропустить / Отменить
 * - Фильтрация по типу и поиск по имени
 * - Прогресс-бар, лог операций, экспорт отчёта
 * - Цветовая кодировка: синий=синхронизировано, зелёный=совпадает,
 *   жёлтый=нет в Kommo, красный=различается
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as api from './api';
import './FieldSync.css';

// ─── Константы ───────────────────────────────────────────────────────────────

/** Человекочитаемые названия типов полей */
const TYPE_LABELS = {
  text: 'Текст', textarea: 'Текстовая область', numeric: 'Число',
  select: 'Список', multiselect: 'Мультисписок', radiobutton: 'Переключатель',
  checkbox: 'Флажок', date: 'Дата', date_time: 'Дата и время',
  url: 'URL', multitext: 'Множественный текст (тел/email)',
  tracking_data: 'UTM / Трекинг', smart_address: 'Адрес', chained_lists: 'Связанный список',
};

/** Группы типов для фильтра */
const TYPE_FILTER_GROUPS = [
  { id: 'all', label: 'Все' },
  { id: 'text', label: 'Текст', types: ['text', 'textarea', 'url'] },
  { id: 'numeric', label: 'Число', types: ['numeric'] },
  { id: 'list', label: 'Списки', types: ['select', 'multiselect', 'radiobutton'] },
  { id: 'date', label: 'Даты', types: ['date', 'date_time'] },
  { id: 'toggle', label: 'Переключатели', types: ['checkbox'] },
  { id: 'other', label: 'Прочее', types: ['multitext', 'tracking_data', 'smart_address', 'chained_lists'] },
];

/** Цвета статусов совпадения */
const STATUS_COLOR = {
  synced:    '#1e40af',  // синий
  matched:   '#166534',  // зелёный
  different: '#991b1b',  // красный
  missing:   '#713f12',  // жёлтый/коричневый
  partial:   '#6d28d9',  // фиолетовый
  skipped:   '#374151',  // серый
};

const STATUS_BG = {
  synced:    '#dbeafe',
  matched:   '#dcfce7',
  different: '#fee2e2',
  missing:   '#fef9c3',
  partial:   '#ede9fe',
  skipped:   '#f3f4f6',
};

const STATUS_LABEL = {
  synced:    '✅ Синхронизировано',
  matched:   '🟢 Совпадает',
  different: '🔴 Отличается',
  missing:   '🟡 Нет в Kommo',
  partial:   '🟣 Частично',
  skipped:   '⏭ Пропущено',
};

/** Лейблы для способа сопоставления поля */
const MATCHED_VIA_LABEL = {
  translation: '🔤 по переводу',
  partial:     '🔍 похожее',
  mapped:      '📌 по маппингу',
};

/** Сущности */
const ENTITIES = [
  { id: 'leads',     label: '📋 Сделки' },
  { id: 'contacts',  label: '👤 Контакты' },
  { id: 'companies', label: '🏢 Компании' },
];

// ─── Вспомогательные компоненты ──────────────────────────────────────────────

/**
 * FieldPreview — реалистичный предпросмотр поля как оно выглядит в карточке CRM.
 * Для списочных полей показывает все варианты в раскрытом виде.
 */
function FieldPreview({ field, side, pendingEnums = [] }) {
  if (!field) return <div className="field-preview-empty">—</div>;
  const { type, enums = [], name } = field;
  const hasPending = pendingEnums && pendingEnums.length > 0;

  switch (type) {
    case 'text':
      return <div className="fp-input"><input type="text" placeholder={name} readOnly /></div>;
    case 'textarea':
      return <div className="fp-input"><textarea placeholder={name} rows={2} readOnly /></div>;
    case 'numeric':
      return <div className="fp-input"><input type="number" placeholder="0" readOnly /></div>;
    case 'url':
      return <div className="fp-input"><input type="url" placeholder="https://" readOnly /></div>;
    case 'date':
      return <div className="fp-input"><input type="date" readOnly /></div>;
    case 'date_time':
      return <div className="fp-input"><input type="datetime-local" readOnly /></div>;
    case 'checkbox':
      return (
        <div className="fp-checkbox">
          <label><input type="checkbox" defaultChecked={false} readOnly />{' '}{name}</label>
        </div>
      );
    case 'select':
      return (
        <div className="fp-enum-list">
          {enums.map((e, i) => (
            <label key={i} className="fp-enum-item fp-radio">
              <input type="radio" name={`r_${side}_${field.id}`} readOnly />
              <span>{e.value}</span>
            </label>
          ))}
          {hasPending && (
            <div className="fp-pending-header">➕ Будет добавлено из AMO:</div>
          )}
          {hasPending && pendingEnums.map((e, i) => (
            <label key={'p' + i} className="fp-enum-item fp-radio fp-enum-item-pending">
              <input type="radio" name={`r_${side}_${field.id}`} readOnly />
              <span>{e.value}</span>
            </label>
          ))}
          {!enums.length && !hasPending && <span className="fp-no-enums">Нет вариантов</span>}
        </div>
      );
    case 'radiobutton':
      return (
        <div className="fp-enum-list">
          {enums.map((e, i) => (
            <label key={i} className="fp-enum-item fp-radio">
              <input type="radio" name={`rb_${side}_${field.id}`} readOnly />
              <span>{e.value}</span>
            </label>
          ))}
          {hasPending && (
            <div className="fp-pending-header">➕ Будет добавлено из AMO:</div>
          )}
          {hasPending && pendingEnums.map((e, i) => (
            <label key={'p' + i} className="fp-enum-item fp-radio fp-enum-item-pending">
              <input type="radio" name={`rb_${side}_${field.id}`} readOnly />
              <span>{e.value}</span>
            </label>
          ))}
          {!enums.length && !hasPending && <span className="fp-no-enums">Нет вариантов</span>}
        </div>
      );
    case 'multiselect':
      return (
        <div className="fp-enum-list">
          {enums.map((e, i) => (
            <label key={i} className="fp-enum-item fp-check">
              <input type="checkbox" readOnly defaultChecked={false} />
              <span>{e.value}</span>
            </label>
          ))}
          {hasPending && (
            <div className="fp-pending-header">➕ Будет добавлено из AMO:</div>
          )}
          {hasPending && pendingEnums.map((e, i) => (
            <label key={'p' + i} className="fp-enum-item fp-check fp-enum-item-pending">
              <input type="checkbox" readOnly defaultChecked={false} />
              <span>{e.value}</span>
            </label>
          ))}
          {!enums.length && !hasPending && <span className="fp-no-enums">Нет вариантов</span>}
        </div>
      );
    case 'multitext':
      return (
        <div className="fp-multitext">
          {(enums || []).slice(0, 3).map((e, i) => (
            <div key={i} className="fp-multitext-row">
              <span className="fp-multitext-label">{e.value}</span>
              <input type="text" placeholder="..." readOnly />
            </div>
          ))}
          {!enums.length && <div className="fp-multitext-row"><span className="fp-multitext-label">Рабочий</span><input type="text" readOnly /></div>}
        </div>
      );
    case 'tracking_data':
      return <div className="fp-input fp-tracking"><input type="text" placeholder="auto (utm/tracker)" readOnly className="fp-readonly" /></div>;
    default:
      return <div className="fp-input"><input type="text" placeholder={TYPE_LABELS[type] || type} readOnly /></div>;
  }
}

/**
 * MetaBadge — небольшой бейдж с метаинформацией о поле.
 */
function MetaBadge({ label, value, mono = false }) {
  if (!value && value !== 0) return null;
  return (
    <span className="meta-badge">
      <span className="meta-label">{label}:</span>
      <span className={`meta-value${mono ? ' meta-mono' : ''}`}>{String(value)}</span>
    </span>
  );
}

/**
 * FieldMeta — блок с метаданными поля (тип, ID, code, группа, обязательность, видимость).
 */
function FieldMeta({ field, entityLabel, groupName, stageMapping }) {
  if (!field) return null;
  const requiredCount = (field.required_statuses || []).length;
  const hiddenCount = (field.hidden_statuses || []).length;
  return (
    <div className="field-meta">
      <MetaBadge label="ID" value={field.id} mono />
      <MetaBadge label="Тип" value={TYPE_LABELS[field.type] || field.type} />
      <MetaBadge label="Сущность" value={entityLabel} />
      {field.code && <MetaBadge label="Code" value={field.code} mono />}
      <MetaBadge label="Группа" value={groupName} />
      {(field.enums || []).length > 0 && <MetaBadge label="Вариантов" value={field.enums.length} />}
      {field.sort !== undefined && <MetaBadge label="Sort" value={field.sort} mono />}
      {field.is_api_only && <span className="meta-badge meta-warn">🔒 Только API</span>}
      {field.is_predefined && <span className="meta-badge meta-info">📌 Системное</span>}
      {requiredCount > 0 && <span className="meta-badge meta-danger">⚠ Обязательное ({requiredCount} эт.)</span>}
      {hiddenCount > 0 && <span className="meta-badge meta-warn">👁 Скрыто ({hiddenCount} эт.)</span>}
    </div>
  );
}

/**
 * DiffBadge — показывает список расхождений между полями.
 */
function DiffBadge({ differences }) {
  if (!differences || !differences.length) return null;
  const labels = { type: 'тип', enums: 'варианты', is_api_only: 'видимость' };
  return (
    <div className="diff-badges">
      {differences.map(d => (
        <span key={d} className="diff-badge">⚡ {labels[d] || d}</span>
      ))}
    </div>
  );
}

/**
 * FieldCard — карточка одного поля (AMO или Kommo) в колонке сравнения.
 */
function FieldCard({ field, status, side, entityLabel, groupName, differences, pendingEnums = [] }) {
  const [expanded, setExpanded] = useState(false);
  if (!field) {
    return (
      <div className="field-card field-card-empty">
        <div className="field-card-empty-msg">
          {side === 'kommo' ? '—' : '—'}
        </div>
      </div>
    );
  }

  return (
    <div className={`field-card field-card-${status}`}>
      <div className="field-card-header" onClick={() => setExpanded(e => !e)}>
        <div className="field-card-title">
          <span className="field-name">{field.name || '(без имени)'}</span>
          <span className="field-type-tag">{TYPE_LABELS[field.type] || field.type}</span>
          {groupName && (
            <span className="field-group-tag">📁 {groupName}</span>
          )}
        </div>
        <button className="field-expand-btn">{expanded ? '▲' : '▼'}</button>
      </div>

      {/* Предпросмотр поля */}
      <div className="field-preview">
        {pendingEnums.length > 0 && (
          <div className="fp-partial-kommo-note">
            🟣 Список после подтверждения
          </div>
        )}
        <FieldPreview field={field} side={side} pendingEnums={pendingEnums} />
      </div>

      {/* Расхождения (только для левой колонки) */}
      {side === 'amo' && <DiffBadge differences={differences} />}

      {/* Метаданные (раскрывается по клику) */}
      {expanded && (
        <div className="field-meta-panel">
          <FieldMeta field={field} entityLabel={entityLabel} groupName={groupName} />
        </div>
      )}
    </div>
  );
}

// ─── Основной компонент ───────────────────────────────────────────────────────

export default function FieldSync({ pipelines, isActive = true }) {
  // ── Данные ──
  const [data, setData]         = useState(null);   // ответ /fields-analysis
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  // ── Фильтры ──
  const [entity, setEntity]     = useState('leads');
  const [typeFilter, setTypeF]  = useState('all');
  const [groupFilter, setGroupFilter] = useState('all'); // 'all' или id группы
  const [search, setSearch]     = useState('');
  const [showSynced, setShowSynced] = useState(true); // показывать уже синхронизированные
  const [statusFilter, setStatusFilter] = useState(null); // фильтр по клику на сводке (null = все)

  // ── Выбор полей ──
  const [selected, setSelected] = useState(new Set()); // amoFieldId keys
  const [inProgress, setInProgress] = useState(false);

  // ── Прогресс ──
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  // ── Лог ──
  const [log, setLog]           = useState(() => {
    try { return JSON.parse(localStorage.getItem('fsync_log') || '[]'); } catch { return []; }
  });
  const logRef = useRef(null);

  // ── История для отмены ──
  const [history, setHistory]   = useState([]);

  // ── Сохранение состояния между сессиями ──
  useEffect(() => {
    const saved = localStorage.getItem('fsync_entity');
    if (saved) setEntity(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem('fsync_entity', entity);
    setGroupFilter('all'); // При смене сущности сбрасываем фильтр групп
    setStatusFilter(null); // Сбрасываем фильтр статуса
  }, [entity]);

  useEffect(() => {
    localStorage.setItem('fsync_log', JSON.stringify(log.slice(-100)));
    // Прокрутить лог вниз
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  // Авторефреш: перезагружаем анализ, если вкладка стала активной и данные уже были загружены.
  // Это нужно чтобы не показывались устаревшие статусы (например, поля удалены в Kommo).
  useEffect(() => {
    if (isActive && data && !inProgress && !loading) {
      loadAnalysis();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // ── Загрузка данных ──
  const loadAnalysis = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.getFieldsAnalysis();
      setData(result);
      addLog('✅ Данные загружены. Всего полей: ' + result.summary.total);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      addLog('❌ Ошибка загрузки: ' + (e.response?.data?.error || e.message));
    }
    setLoading(false);
  }, []);

  const addLog = (msg) => {
    const ts = new Date().toLocaleTimeString('ru-RU');
    setLog(prev => [...prev, { ts, msg }]);
  };

  // ── Получить все видимые поля с учётом фильтров ──
  const getVisibleFields = useCallback(() => {
    if (!data) return [];
    const entityData = data.entities?.[entity];
    if (!entityData) return [];
    const pattern = search.toLowerCase().trim();
    const filterTypes = TYPE_FILTER_GROUPS.find(g => g.id === typeFilter)?.types;
    const results = [];

    for (const group of (entityData.groups || [])) {
      // Фильтр по группе
      if (groupFilter !== 'all' && group.id !== groupFilter) continue;
      for (const fieldPair of (group.fields || [])) {
        const af = fieldPair.amo;
        if (!af) continue;
        // Фильтр по типу
        if (filterTypes && !filterTypes.includes(af.type)) continue;
        // Фильтр по поиску
        if (pattern && !(af.name || '').toLowerCase().includes(pattern) &&
            !(af.code || '').toLowerCase().includes(pattern)) continue;
        // Скрывать синхронизированные если выключен показ
        if (fieldPair.status === 'synced' && !showSynced) continue;
        // Фильтр по клику на сводке
        if (statusFilter && fieldPair.status !== statusFilter) continue;
        results.push({ ...fieldPair, groupId: group.id, groupName: group.name });
      }
    }
    return results;
  }, [data, entity, typeFilter, groupFilter, search, showSynced, statusFilter]);

  const visibleFields = getVisibleFields();

  // ── Выбрать / снять всё ──
  const selectAll = () => {
    // Исключаем synced и matched — они уже есть в Kommo и не требуют создания
    const ids = new Set(visibleFields.filter(f => f.status !== 'synced' && f.status !== 'matched').map(f => entity + '_' + f.amo.id));
    setSelected(prev => new Set([...prev, ...ids]));
  };

  const clearAll = () => {
    const ids = new Set(visibleFields.map(f => entity + '_' + f.amo.id));
    setSelected(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });
  };

  const toggleField = (fieldPair) => {
    // Запрещаем выбор полей с полным совпадением — они не должны создаваться/изменяться
    if (fieldPair.status === 'synced' || fieldPair.status === 'matched') {
      addLog(`⛔ Поле "${fieldPair.amo.name}" (${STATUS_LABELS[fieldPair.status]}) уже существует в Kommo — выбор запрещён.`);
      return;
    }
    const key = entity + '_' + fieldPair.amo.id;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // ── Подтвердить (создать выбранные поля в Kommo) ──
  const handleConfirm = async () => {
    const toCreate = visibleFields.filter(f => {
      const key = entity + '_' + f.amo.id;
      return selected.has(key) && (f.status === 'missing' || f.status === 'partial');
    });
    // Предупреждение о полях, которые уже есть в Kommo и будут пропущены
    const blockedSelected = visibleFields.filter(f => {
      const key = entity + '_' + f.amo.id;
      return selected.has(key) && (f.status === 'synced' || f.status === 'matched');
    });
    if (blockedSelected.length > 0) {
      addLog(`⛔ ВНИМАНИЕ: ${blockedSelected.length} выбранных полей уже существуют в Kommo (${STATUS_LABELS['matched']} / ${STATUS_LABELS['synced']}) — они будут пропущены без изменений:`);
      blockedSelected.forEach(f => addLog(`   • "${f.amo.name}" [статус: ${STATUS_LABELS[f.status]}]`));
    }
    if (!toCreate.length) {
      addLog('ℹ️ Нет полей для создания. Выберите поля со статусом "Нет в Kommo" или "Частично".');
      return;
    }
    setInProgress(true);
    setProgress({ done: 0, total: toCreate.length });
    const snapshot = [...selected];
    const createdItems = [];
    for (let i = 0; i < toCreate.length; i++) {
      const fp = toCreate[i];
      try {
        const result = await api.createField(entity, fp.amo.id, fp.status);
        if (result.groupCreated) {
          addLog(`📁 Создана группа полей в Kommo: "${result.groupCreated.name}" (ID ${result.groupCreated.id})`);
        }
        if (result.patched) {
          addLog(`🟣 Обновлено: "${fp.amo.name}" — добавлено ${result.addedEnums} значений в Kommo`);
        } else {
          addLog(`✅ Создано: "${fp.amo.name}" → Kommo ID ${result.kommoField?.id}`);
        }
        createdItems.push({ entity, amoFieldId: fp.amo.id, kommoField: result.kommoField });
      } catch (e) {
        addLog(`❌ Ошибка при создании "${fp.amo.name}": ${e.response?.data?.error || e.message}`);
      }
      setProgress({ done: i + 1, total: toCreate.length });
    }
    // Сохранить в историю для возможности отмены
    if (createdItems.length) {
      setHistory(prev => [...prev, { type: 'created', items: createdItems, prevSelected: snapshot }]);
    }
    setSelected(prev => {
      const next = new Set(prev);
      toCreate.forEach(f => next.delete(entity + '_' + f.amo.id));
      return next;
    });
    setInProgress(false);
    addLog(`🏁 Создано ${createdItems.length} из ${toCreate.length} полей.`);
    // Перезагрузить данные для обновления статусов
    await loadAnalysis();
  };

  // ── Пропустить выбранные поля ──
  const handleSkip = async () => {
    const toSkip = visibleFields.filter(f => selected.has(entity + '_' + f.amo.id));
    if (!toSkip.length) { addLog('ℹ️ Нет выбранных полей для пропуска'); return; }
    setInProgress(true);
    for (const fp of toSkip) {
      try {
        await api.skipField(entity, fp.amo.id);
        addLog(`⏭ Пропущено: "${fp.amo.name}"`);
      } catch (e) {
        addLog(`❌ Ошибка пропуска "${fp.amo.name}": ${e.message}`);
      }
    }
    clearAll();
    setInProgress(false);
    await loadAnalysis();
  };

  // ── Отменить последнее действие ──
  const handleCancel = () => {
    if (!history.length) { addLog('ℹ️ Нет действий для отмены'); return; }
    const last = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    setSelected(new Set(last.prevSelected || []));
    addLog('↩️ Отменено последнее действие. Созданные поля в Kommo не удаляются (требуется ручное удаление через API).');
  };

  // ── Экспорт отчёта ──
  const handleExport = () => {
    if (!data) return;
    const report = {
      generatedAt: new Date().toISOString(),
      summary: data.summary,
      fieldMapping: data.fieldMapping,
      log: log,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `field_migration_report_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addLog('📥 Отчёт экспортирован в JSON');
  };

  // ─── Рендер ────────────────────────────────────────────────────────────────

  const summary = data?.summary;
  const entityData = data?.entities?.[entity];

  // Список групп для текущей сущности
  const currentGroups = entityData?.groups || [];

  // Количество выбранных в текущей сущности
  const selectedCount = [...selected].filter(k => k.startsWith(entity + '_')).length;

  return (
    <div className="fieldsync-root">

      {/* ── Шапка с заголовком и кнопками ── */}
      <div className="fs-header">
        <div className="fs-title">
          <h2>🔧 Синхронизация полей</h2>
          <p className="fs-subtitle">Перенос кастомных полей из AMO CRM в Kommo CRM с визуальным сравнением</p>
        </div>
        <div className="fs-header-actions">
          <button className="btn btn-primary" onClick={loadAnalysis} disabled={loading}>
            {loading ? '⏳ Загрузка...' : '🔄 Загрузить/Обновить'}
          </button>
          {data && (
            <button className="btn btn-secondary" onClick={handleExport}>
              📥 Экспорт отчёта
            </button>
          )}
        </div>
      </div>

      {/* ── Сводка ── */}
      {summary && (
        <div className="fs-summary">
          {/* Всего — сбрасывает фильтр */}
          <div
            className={`fs-sum-item fs-sum-total${statusFilter === null ? ' fs-sum-active' : ''}`}
            onClick={() => setStatusFilter(null)}
            title="Показать все поля"
          >
            <span className="fs-sum-val">{summary.total}</span>
            <span className="fs-sum-lbl">Всего</span>
          </div>
          {summary.synced > 0 && (
            <div
              className={`fs-sum-item fs-sum-synced${statusFilter === 'synced' ? ' fs-sum-active' : ''}`}
              onClick={() => setStatusFilter(f => f === 'synced' ? null : 'synced')}
              title="Нажмите, чтобы показать только синхронизированные"
            >
              <span className="fs-sum-val">{summary.synced}</span>
              <span className="fs-sum-lbl">✅ Синхронизировано</span>
            </div>
          )}
          {summary.matched > 0 && (
            <div
              className={`fs-sum-item fs-sum-matched${statusFilter === 'matched' ? ' fs-sum-active' : ''}`}
              onClick={() => setStatusFilter(f => f === 'matched' ? null : 'matched')}
              title="Нажмите, чтобы показать только совпадающие"
            >
              <span className="fs-sum-val">{summary.matched}</span>
              <span className="fs-sum-lbl">🟢 Совпадает</span>
            </div>
          )}
          <div
            className={`fs-sum-item fs-sum-missing${statusFilter === 'missing' ? ' fs-sum-active' : ''}`}
            onClick={() => setStatusFilter(f => f === 'missing' ? null : 'missing')}
            title="Нажмите, чтобы показать только отсутствующие"
          >
            <span className="fs-sum-val">{summary.missing}</span>
            <span className="fs-sum-lbl">🟡 Нет в Kommo</span>
          </div>
          <div
            className={`fs-sum-item fs-sum-different${statusFilter === 'different' ? ' fs-sum-active' : ''}`}
            onClick={() => setStatusFilter(f => f === 'different' ? null : 'different')}
            title="Нажмите, чтобы показать только отличающиеся"
          >
            <span className="fs-sum-val">{summary.different}</span>
            <span className="fs-sum-lbl">🔴 Отличается</span>
          </div>
          {summary.partial > 0 && (
            <div
              className={`fs-sum-item fs-sum-partial${statusFilter === 'partial' ? ' fs-sum-active' : ''}`}
              onClick={() => setStatusFilter(f => f === 'partial' ? null : 'partial')}
              title="Нажмите, чтобы показать только частичные совпадения"
            >
              <span className="fs-sum-val">{summary.partial}</span>
              <span className="fs-sum-lbl">🟣 Частично</span>
            </div>
          )}
          {summary.skipped > 0 && (
            <div
              className={`fs-sum-item fs-sum-skipped${statusFilter === 'skipped' ? ' fs-sum-active' : ''}`}
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
      )}


      {error && <div className="fs-error">❌ {error}</div>}

      {data && (
        <>
          {/* ── Панель управления ── */}
          <div className="fs-controls">
            {/* Вкладки сущностей */}
            <div className="fs-entity-tabs">
              {ENTITIES.map(e => (
                <button
                  key={e.id}
                  className={`fs-entity-tab${entity === e.id ? ' active' : ''}`}
                  onClick={() => setEntity(e.id)}
                >
                  {e.label}
                  {data.entities?.[e.id] && (
                    <span className="fs-entity-count">
                      {data.entities[e.id].groups?.reduce((acc, g) => acc + g.fields.length, 0)}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Фильтр по группам */}
            {currentGroups.length > 1 && (
              <div className="fs-group-filter">
                <span className="fs-group-filter-label">📁 Группа:</span>
                <div className="fs-group-btns">
                  <button
                    className={`fs-group-btn${groupFilter === 'all' ? ' active' : ''}`}
                    onClick={() => setGroupFilter('all')}
                  >
                    Все
                    <span className="fs-group-btn-count">
                      {currentGroups.reduce((acc, g) => acc + g.fields.length, 0)}
                    </span>
                  </button>
                  {currentGroups.map(g => {
                    // Считаем статусы для бейджа
                    const counts = { synced: 0, matched: 0, partial: 0, missing: 0, different: 0, skipped: 0 };
                    g.fields.forEach(f => { if (counts[f.status] !== undefined) counts[f.status]++; });
                    const dominantStatus = ['different', 'partial', 'missing', 'matched', 'synced'].find(s => counts[s] > 0);
                    return (
                      <button
                        key={g.id}
                        className={`fs-group-btn fs-group-btn-${dominantStatus || 'neutral'}${groupFilter === g.id ? ' active' : ''}`}
                        onClick={() => setGroupFilter(groupFilter === g.id ? 'all' : g.id)}
                        title={`Синхр: ${counts.synced}, Совп: ${counts.matched}, Частично: ${counts.partial}, Нет: ${counts.missing}, Различ: ${counts.different}`}
                      >
                        {g.name}
                        <span className="fs-group-btn-count">{g.fields.length}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Поиск и фильтры */}
            <div className="fs-filters">
              <input
                className="fs-search"
                placeholder="🔍 Поиск по названию или коду..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <div className="fs-type-filters">
                {TYPE_FILTER_GROUPS.map(g => (
                  <button
                    key={g.id}
                    className={`fs-type-btn${typeFilter === g.id ? ' active' : ''}`}
                    onClick={() => setTypeF(g.id)}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
              <label className="fs-show-synced">
                <input
                  type="checkbox"
                  checked={showSynced}
                  onChange={e => setShowSynced(e.target.checked)}
                />
                {' '}Показывать синхронизированные
              </label>
            </div>

            {/* Кнопки управления выборкой */}
            <div className="fs-selection-row">
              <div className="fs-selection-btns">
                <button className="btn btn-sm btn-secondary" onClick={selectAll}>☑ Выбрать всё</button>
                <button className="btn btn-sm btn-secondary" onClick={clearAll}>☐ Сбросить всё</button>
              </div>
              <div className="fs-action-btns">
                <button
                  className="btn btn-confirm"
                  onClick={handleConfirm}
                  disabled={inProgress || selectedCount === 0}
                  title="Создать выбранные поля в Kommo"
                >
                  {inProgress ? `⏳ ${progress.done}/${progress.total}` : `✓ Подтвердить (${selectedCount})`}
                </button>
                <button className="btn btn-cancel" onClick={handleCancel} disabled={inProgress || !history.length}>
                  ✗ Отменить
                </button>
                <button
                  className="btn btn-skip"
                  onClick={handleSkip}
                  disabled={inProgress || selectedCount === 0}
                >
                  — Пропустить
                </button>
              </div>
            </div>

            {/* Прогресс-бар */}
            {inProgress && (
              <div className="fs-progress-bar">
                <div className="fs-progress-inner" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                <span className="fs-progress-text">{progress.done} / {progress.total}</span>
              </div>
            )}
          </div>

          {/* ── Заголовки колонок ── */}
          <div className="fs-columns-header">
            <div className="fs-col-head fs-col-amo">
              <span className="fs-col-logo fs-amo-logo">AMO CRM</span>
              <span className="fs-col-sub">Источник</span>
            </div>
            <div className="fs-col-separator" />
            <div className="fs-col-head fs-col-kommo">
              <span className="fs-col-logo fs-kommo-logo">Kommo CRM</span>
              <span className="fs-col-sub">Назначение</span>
            </div>
          </div>

          {/* ── Список полей ── */}
          <div className="fs-fields-container">
            {visibleFields.length === 0 ? (
              <div className="fs-no-fields">
                {loading ? '⏳ Загрузка...' : '🔍 Нет полей, соответствующих фильтрам'}
              </div>
            ) : (
              <FieldList
                fields={visibleFields}
                entity={entity}
                entityLabel={ENTITIES.find(e => e.id === entity)?.label || entity}
                selected={selected}
                onToggle={toggleField}
              />
            )}
          </div>
        </>
      )}

      {!data && !loading && (
        <div className="fs-empty-state">
          <div className="fs-empty-icon">🔧</div>
          <div className="fs-empty-title">Данные не загружены</div>
          <div className="fs-empty-desc">Нажмите «Загрузить/Обновить» чтобы получить и сравнить кастомные поля из обоих аккаунтов.</div>
          <button className="btn btn-primary" onClick={loadAnalysis} style={{ marginTop: 16 }}>
            🔄 Загрузить
          </button>
        </div>
      )}

      {/* ── Лог операций ── */}
      <div className="fs-log-section">
        <div className="fs-log-header">
          <span>📋 Лог операций</span>
          <button className="btn-clear-log" onClick={() => setLog([])}>Очистить</button>
        </div>
        <div className="fs-log-body" ref={logRef}>
          {log.length === 0 ? (
            <div className="fs-log-empty">Лог пуст</div>
          ) : (
            log.map((entry, i) => (
              <div key={i} className="fs-log-line">
                <span className="fs-log-ts">{entry.ts}</span>
                <span className="fs-log-msg">{entry.msg}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── FieldList ────────────────────────────────────────────────────────────────
/**
 * FieldList — отрендеренный список пар полей (AMO / Kommo) с поддержкой групп.
 * Уже синхронизированные поля отображаются в конце списка и визуально затемнены.
 */
function FieldList({ fields, entity, entityLabel, selected, onToggle }) {
  // Группируем поля по groupName
  const groups = {};
  const groupOrder = [];
  fields.forEach(fp => {
    const gk = fp.groupId || '__other__';
    if (!groups[gk]) {
      groups[gk] = { name: fp.groupName || 'Прочее', fields: [] };
      groupOrder.push(gk);
    }
    groups[gk].fields.push(fp);
  });

  // Статистика по группе
  const groupStats = (fields) => {
    const s = { synced: 0, matched: 0, partial: 0, missing: 0, different: 0, skipped: 0 };
    fields.forEach(f => { if (s[f.status] !== undefined) s[f.status]++; });
    return s;
  };

  return (
    <div className="fs-field-list">
      {groupOrder.map(gk => {
        const group = groups[gk];
        const stats = groupStats(group.fields);
        return (
          <div key={gk} className="fs-group-section">
            {/* Заголовок группы */}
            <div className="fs-group-header">
              <span className="fs-group-name">📁 {group.name}</span>
              <div className="fs-group-stats">
                {stats.synced > 0 && <span className="fs-gstat fs-gstat-synced">{stats.synced}</span>}
                {stats.matched > 0 && <span className="fs-gstat fs-gstat-matched">{stats.matched}</span>}
                {stats.partial > 0 && <span className="fs-gstat fs-gstat-partial">{stats.partial}</span>}
                {stats.missing > 0 && <span className="fs-gstat fs-gstat-missing">{stats.missing}</span>}
                {stats.different > 0 && <span className="fs-gstat fs-gstat-different">{stats.different}</span>}
                {stats.skipped > 0 && <span className="fs-gstat fs-gstat-skipped">{stats.skipped}</span>}
                <span className="fs-group-count">{group.fields.length} пол.</span>
              </div>
            </div>

          {/* Пары полей в группе */}
          {group.fields.map((fp, idx) => {
            const key      = entity + '_' + fp.amo.id;
            const isSelected = selected.has(key);
            const isSynced = fp.status === 'synced';
            const isSkipped = fp.status === 'skipped';

            return (
              <div
                key={fp.amo.id}
                className={`fs-field-row fs-row-${fp.status}${isSelected ? ' fs-selected' : ''}${isSynced ? ' fs-synced-row' : ''}${isSkipped ? ' fs-skipped-row' : ''}`}
              >
                {/* Чекбокс выбора */}
                <div className="fs-row-checkbox">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggle(fp)}
                    disabled={isSynced || isSkipped}
                    title={isSynced ? 'Уже синхронизировано' : isSkipped ? 'Пропущено' : 'Выбрать для переноса'}
                  />
                </div>

                {/* Статус-бейдж */}
                <div className="fs-row-status">
                  <span
                    className="fs-status-badge"
                    style={{ background: STATUS_BG[fp.status], color: STATUS_COLOR[fp.status] }}
                  >
                    {STATUS_LABEL[fp.status]}
                  </span>
                  {fp.matchedVia && MATCHED_VIA_LABEL[fp.matchedVia] && (
                    <span className="fs-matched-via-badge">
                      {MATCHED_VIA_LABEL[fp.matchedVia]}
                    </span>
                  )}
                  {fp.status === 'partial' && fp.missingCount > 0 && (
                    <span className="fs-partial-count" title="Нужно добавить значений в Kommo">
                      +{fp.missingCount} знач.
                    </span>
                  )}
                </div>

                {/* Колонка AMO */}
                <div className="fs-col fs-col-left">
                  <FieldCard
                    field={fp.amo}
                    status={fp.status}
                    side="amo"
                    entityLabel={entityLabel}
                    groupName={fp.groupName}
                    differences={fp.differences}
                  />
                </div>

                {/* Стрелка */}
                <div className="fs-arrow">
                  {fp.status === 'missing' ? '→'
                    : fp.status === 'synced' ? '✅'
                    : fp.status === 'partial' ? '🟣'
                    : fp.matchedVia === 'translation' ? '🔤'
                    : fp.matchedVia === 'partial' ? '≈'
                    : '⇄'}
                </div>

                {/* Колонка Kommo */}
                <div className="fs-col fs-col-right">
                  {fp.kommo ? (
                    <FieldCard
                      field={fp.kommo}
                      status={fp.status}
                      side="kommo"
                      entityLabel={entityLabel}
                      groupName={fp.groupName}
                      differences={[]}
                      pendingEnums={fp.status === 'partial' ? (fp.missingEnums || []) : []}
                    />
                  ) : (
                    <div className="fs-kommo-placeholder">
                      <div className="fs-kommo-placeholder-icon">+</div>
                      <div className="fs-kommo-placeholder-text">
                        {fp.status === 'skipped' ? 'Пропущено' : 'Будет создано при подтверждении'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        );
      })}
    </div>
  );
}
