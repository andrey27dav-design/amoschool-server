import { useState, useEffect, useCallback } from 'react';
import * as api from './api';
import './App.css';
import FieldSync from './FieldSync';

const STATUS_LABELS = {
  idle: 'Ожидание',
  running: 'Выполняется',
  completed: 'Завершено',
  error: 'Ошибка',
  rolling_back: 'Откат...',
};

const STATUS_COLORS = {
  idle: '#6b7280',
  running: '#3b82f6',
  completed: '#10b981',
  error: '#ef4444',
  rolling_back: '#f59e0b',
};

const MIGRATION_PLAN = [
  { step: 1, title: 'Синхронизация этапов воронки', desc: 'Вкладка «Воронки» → выберите воронку из amo CRM и воронку в Kommo → нажмите «Синхронизировать этапы». Система создаст в Kommo CRM (воронка RUSSIANLANGUADGE DEPARTMENT) все этапы из воронки Школа/Репетиторство. Новые этапы отмечаются бейджем NEW.' },
  { step: 2, title: 'Синхронизация кастомных полей', desc: 'Вкладка «Поля» → загрузите анализ полей → выберите поля со статусом «Нет в Kommo» или «Частично» → нажмите «Создать выбранные». Поля с полным совпадением (синхронизированные) не требуют действий.' },
  { step: 3, title: 'Загрузка данных из amo CRM', desc: 'Вкладка «Данные amo» → нажмите «Загрузить данные». Все сделки, контакты, компании и задачи будут загружены в кэш. После можно просматривать данные и фильтровать по менеджерам.' },
  { step: 4, title: 'Анализ менеджеров', desc: 'Дашборд → нажмите «Анализировать менеджеров». Выберите менеджеров международного ОП, сделки которых нужно перенести. Счётчик «Доступно для переноса» покажет количество отфильтрованных сделок.' },
  { step: 5, title: 'Пакетный перенос сделок', desc: 'Выберите размер пакета (10–200). Нажмите «Перенести N сделок». Система переносит сделки пакетами — компании → контакты → сделки → задачи → комментарии. Счётчик «Перенесено» обновляется после каждого пакета.' },
  { step: 6, title: 'Резервная копия', desc: 'Создаётся автоматически перед каждой миграцией (вкладка «Бэкапы»). Все данные amo CRM сохраняются в JSON-файл. Исходные данные в amo CRM НЕ удаляются автоматически.' },
];

export default function App() {
  const [status, setStatus] = useState(null);
  const [pipelines, setPipelines] = useState({ amo: [], kommo: [] });
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState('dashboard');
  const [helpOpen, setHelpOpen] = useState(false);

  // AMO data browser state
  const [fetchSt, setFetchSt] = useState(null);
  const [amoEntities, setAmoEntities] = useState(null);
  const [entityType, setEntityType] = useState('leads');
  const [entityPage, setEntityPage] = useState(1);
  const [entitySearch, setEntitySearch] = useState('');
  const [entityLoading, setEntityLoading] = useState(false);
  const [showOnlyManagerLeads, setShowOnlyManagerLeads] = useState(false);

  // Batch migration state
  const [batchStats, setBatchStats] = useState(null);
  const [batchStatus, setBatchStatusData] = useState(null);
  const [managers, setManagers] = useState([]);
  const [selectedManagers, setSelectedManagers] = useState([]);
  const [batchSize, setBatchSize] = useState(10);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);

  // Pipeline selector state
  const [selectedAmoPipeline, setSelectedAmoPipeline] = useState(null);
  const [selectedKommoPipeline, setSelectedKommoPipeline] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const [syncLoading, setSyncLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.getMigrationStatus();
      setStatus(data);
    } catch (e) {
      console.error('Status fetch error:', e);
    }
  }, []);

  const fetchPipelines = useCallback(async () => {
    try {
      const [amo, kommo] = await Promise.all([api.getAmoPipelines(), api.getKommoPipelines()]);
      setPipelines({ amo, kommo });
      // Auto-select first pipelines if nothing chosen yet
      setSelectedAmoPipeline(prev => prev ?? (amo[0]?.id ?? null));
      setSelectedKommoPipeline(prev => prev ?? (kommo[0]?.id ?? null));
    } catch (e) {
      console.error('Pipelines fetch error:', e);
    }
  }, []);

  const fetchBackups = useCallback(async () => {
    try {
      const data = await api.getBackups();
      setBackups(data);
    } catch (e) {
      console.error('Backups fetch error:', e);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchPipelines();
    fetchBackups();
    // Load amo fetch status on mount
    api.getAmoFetchStatus().then(setFetchSt).catch(() => {});
    // Load batch stats and config on mount
    api.getBatchStats().then(setBatchStats).catch(() => {});
    api.getBatchStatus().then(d => {
      setBatchStatusData(d);
      if (d?.batchConfig) {
        setSelectedManagers(d.batchConfig.managerIds || []);
        setBatchSize(d.batchConfig.batchSize || 10);
      }
    }).catch(() => {});
    api.getBatchConfig().then(cfg => {
      setSelectedManagers(cfg.managerIds || []);
      setBatchSize(cfg.batchSize || 10);
    }).catch(() => {});
  }, []);

  // Auto-poll while amo data is loading
  useEffect(() => {
    if (fetchSt?.status !== 'loading') return;
    const iv = setInterval(() => {
      api.getAmoFetchStatus().then(s => {
        setFetchSt(s);
        if (s.status !== 'loading') {
          clearInterval(iv);
          if (s.status === 'done') loadEntities(entityType, 1, entitySearch);
        }
      }).catch(() => {});
    }, 1500);
    return () => clearInterval(iv);
  }, [fetchSt?.status]);

  // Auto-refresh when running
  useEffect(() => {
    if (!status) return;
    if (status.status === 'running' || status.status === 'rolling_back') {
      const interval = setInterval(fetchStatus, 2000);
      return () => clearInterval(interval);
    }
  }, [status?.status]);

  // Poll batch status when batch is running
  useEffect(() => {
    if (batchStatus?.status !== 'running' && batchStatus?.status !== 'rolling_back') return;
    const iv = setInterval(async () => {
      try {
        const d = await api.getBatchStatus();
        setBatchStatusData(d);
        if (d.status !== 'running' && d.status !== 'rolling_back') {
          clearInterval(iv);
          api.getBatchStats().then(setBatchStats).catch(() => {});
        }
      } catch {}
    }, 1500);
    return () => clearInterval(iv);
  }, [batchStatus?.status]);

  const handleStart = async () => {
    if (!confirm('Запустить миграцию данных из amo CRM в Kommo CRM?')) return;
    setLoading(true);
    setMessage('');
    try {
      await api.startMigration();
      setMessage('✅ Миграция запущена');
      setTimeout(fetchStatus, 1000);
    } catch (e) {
      setMessage(`❌ Ошибка: ${e.response?.data?.error || e.message}`);
    }
    setLoading(false);
  };

  const handleRollback = async (steps = null) => {
    const label = steps ? steps.join(', ') : 'все данные';
    if (!confirm(`Откатить: ${label}?`)) return;
    setLoading(true);
    setMessage('');
    try {
      await api.rollbackMigration(steps);
      setMessage('🔄 Откат запущен');
      setTimeout(fetchStatus, 1000);
    } catch (e) {
      setMessage(`❌ Ошибка отката: ${e.response?.data?.error || e.message}`);
    }
    setLoading(false);
  };

  const loadEntities = useCallback(async (type, page, search, onlyManagers, managerIds) => {
    setEntityLoading(true);
    try {
      const data = await api.getAmoEntities(type, page, 50, search || '', onlyManagers, managerIds || []);
      setAmoEntities(data);
    } catch (e) {
      console.error('Entities error:', e);
    }
    setEntityLoading(false);
  }, []);

  const handleAmoFetch = async () => {
    if (!confirm('Загрузить все данные из amo CRM? Это может занять несколько минут.')) return;
    setLoading(true);
    setMessage('');
    try {
      await api.triggerAmoFetch();
      setMessage('⏳ Загрузка данных из amo CRM запущена...');
      const s = await api.getAmoFetchStatus();
      setFetchSt(s);
    } catch (e) {
      setMessage(`❌ Ошибка: ${e.response?.data?.error || e.message}`);
    }
    setLoading(false);
  };

  const handleEntityTypeChange = (type) => {
    setEntityType(type);
    setEntityPage(1);
    setEntitySearch('');
    loadEntities(type, 1, '', showOnlyManagerLeads && type === 'leads', selectedManagers);
  };

  const handleEntitySearch = (e) => {
    const val = e.target.value;
    setEntitySearch(val);
    setEntityPage(1);
    loadEntities(entityType, 1, val, showOnlyManagerLeads && entityType === 'leads', selectedManagers);
  };

  const handleEntityPage = (p) => {
    setEntityPage(p);
    loadEntities(entityType, p, entitySearch, showOnlyManagerLeads && entityType === 'leads', selectedManagers);
  };

  const handleManagerLeadsToggle = (onlyManagers) => {
    setShowOnlyManagerLeads(onlyManagers);
    setEntityPage(1);
    loadEntities(entityType, 1, entitySearch, onlyManagers && entityType === 'leads', selectedManagers);
  };

  const handleOpenDataTab = () => {
    setTab('data');
    if (!amoEntities) loadEntities(entityType, 1, '', false, []);
  };

  const handleSyncStages = async (amoPipelineId, kommoPipelineId) => {
    setSyncLoading(true);
    setMessage('');
    try {
      const result = await api.syncStages(amoPipelineId, kommoPipelineId);
      setSyncResult(result);
      const created = result.created?.length ?? 0;
      const skipped = result.skipped?.length ?? 0;
      setMessage(`✅ Синхронизация завершена: создано ${created} этапов, ${skipped} уже существовали`);
    } catch (e) {
      setMessage(`❌ Ошибка: ${e.response?.data?.error || e.message}`);
    }
    setSyncLoading(false);
    setLoading(false);
  };

  // ─── Batch migration handlers ──────────────────────────────────────────────
  const handleAnalyzeManagers = async () => {
    setAnalyzeLoading(true);
    setMessage('');
    try {
      const data = await api.analyzeManagers();
      setManagers(data.managers || []);
      setSelectedManagers(data.currentManagerIds || []);
      setBatchStats(prev => ({ ...prev, totalEligible: data.eligibleCount, totalLeads: data.totalLeads }));
      setMessage(`✅ Найдено ${data.managers.length} менеджеров, всего сделок: ${data.totalLeads}`);
    } catch (e) {
      setMessage(`❌ Анализ не выполнен: ${e.response?.data?.error || e.message}`);
    }
    setAnalyzeLoading(false);
  };

  const toggleManager = async (id) => {
    const newIds = selectedManagers.includes(id)
      ? selectedManagers.filter(m => m !== id)
      : [...selectedManagers, id];
    setSelectedManagers(newIds);
    try {
      await api.setBatchConfig({ managerIds: newIds, batchSize });
      const stats = await api.getBatchStats();
      setBatchStats(stats);
    } catch {}
  };

  const handleBatchSizeChange = async (sz) => {
    setBatchSize(sz);
    try { await api.setBatchConfig({ managerIds: selectedManagers, batchSize: sz }); } catch {}
  };

  const handleStartBatch = async () => {
    if (selectedManagers.length === 0) {
      if (!confirm('Менеджеры не выбраны — перенести сделки ВСЕХ менеджеров?')) return;
    }
    setBatchLoading(true);
    setMessage('');
    try {
      await api.setBatchConfig({ managerIds: selectedManagers, batchSize });
      await api.startBatch();
      setMessage('⏳ Пакетная миграция запущена...');
      setTimeout(async () => {
        const d = await api.getBatchStatus().catch(() => null);
        if (d) setBatchStatusData(d);
      }, 800);
    } catch (e) {
      setMessage(`❌ Ошибка: ${e.response?.data?.error || e.message}`);
    }
    setBatchLoading(false);
  };

  const handleBatchRollback = async () => {
    if (!confirm('Откатить последний пакет? Созданные сделки, контакты и компании будут удалены из Kommo CRM.')) return;
    setBatchLoading(true);
    try {
      await api.rollbackBatch();
      setMessage('🔄 Откат пакета запущен...');
      setTimeout(async () => {
        const [d, s] = await Promise.all([api.getBatchStatus(), api.getBatchStats()]).catch(() => [null, null]);
        if (d) setBatchStatusData(d);
        if (s) setBatchStats(s);
      }, 1000);
    } catch (e) {
      setMessage(`❌ Ошибка отката: ${e.response?.data?.error || e.message}`);
    }
    setBatchLoading(false);
  };

  const handleBatchReset = async () => {
    if (!confirm('Сбросить счётчик? Следующий пакет начнётся с первой сделки.')) return;
    try {
      await api.resetBatchOffset();
      const stats = await api.getBatchStats();
      setBatchStats(stats);
      setMessage('✅ Счётчик сброшен');
    } catch (e) {
      setMessage(`❌ ${e.response?.data?.error || e.message}`);
    }
  };

  const isRunning = status?.status === 'running' || status?.status === 'rolling_back';
  const progressPct = status?.progress?.total > 0
    ? Math.round((status.progress.current / status.progress.total) * 100)
    : 0;

  return (
    <div className="app">
      <header className="header">
        <div className="header-logo">
          <span className="logo-amo">amo CRM</span>
          <span className="logo-arrow">→</span>
          <span className="logo-kommo">Kommo CRM</span>
        </div>
        <h1>Панель миграции</h1>
        <div className="header-subtitle">Школа/Репетиторство → RUSSIANLANGUADGE DEPARTMENT</div>
        <button className="btn-help" onClick={() => setHelpOpen(true)}>❓ Помощь</button>
      </header>

      {helpOpen && (
        <div className="modal-overlay" onClick={() => setHelpOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📋 Инструкция по переносу данных</h2>
              <button className="modal-close" onClick={() => setHelpOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="plan-intro">
                Перенос данных из <strong>amo CRM</strong> (воронка «Школа/Репетиторство»)
                в <strong>Kommo CRM</strong> (воронка «RUSSIANLANGUADGE DEPARTMENT»).
                Исходные данные сохраняются — ничего не удаляется автоматически.
              </div>
              <div className="plan-warning">
                ⚠️ Рекомендуемый порядок: Воронки → Поля → Данные amo → Дашборд (пакетный перенос)
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
                <p>Кнопка «↩ Откатить пакет» отменяет последний перенесённый пакет сделок (удаляет из Kommo только то, что создано в этом пакете). Кнопка «Откатить всё» на дашборде откатывает всю одиночную миграцию.</p>
              </div>
              <div className="plan-section">
                <h3>📦 Вкладки панели</h3>
                <ul>
                  <li><strong>📊 Дашборд</strong> — пакетный перенос, выбор менеджеров, счётчики, откат</li>
                  <li><strong>📦 Данные amo</strong> — просмотр загруженных данных, фильтр по менеджерам ОП</li>
                  <li><strong>🔀 Воронки</strong> — синхронизация этапов воронок (amo ↔ Kommo)</li>
                  <li><strong>🔧 Поля</strong> — синхронизация кастомных полей (создание в Kommo)</li>
                  <li><strong>💾 Бэкапы</strong> — список созданных резервных копий данных</li>
                </ul>
              </div>
              <div className="plan-section">
                <h3>✅ После успешной миграции</h3>
                <ol>
                  <li>Проверьте счётчик «Перенесено» на дашборде — Сделки, Контакты, Компании.</li>
                  <li>Проверьте данные в Kommo CRM — несколько карточек сделок и их таймлайн.</li>
                  <li>Убедитесь в корректности этапов воронки и кастомных полей.</li>
                  <li>Только после ручной проверки удалите исходные данные в amo CRM.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}

      <nav className="tabs">
        {['dashboard', 'data', 'pipelines', 'fields', 'backups'].map(t => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`}
            onClick={() => t === 'data' ? handleOpenDataTab() : setTab(t)}>
            {t === 'dashboard' ? '📊 Дашборд' : t === 'data' ? '📦 Данные amo' : t === 'pipelines' ? '🔀 Воронки' : t === 'fields' ? '🔧 Поля' : '💾 Бэкапы'}
          </button>
        ))}
      </nav>

      {message && <div className="message">{message}</div>}

      {tab === 'dashboard' && (
        <div className="dashboard">
          {/* Status Card */}
          <div className="card status-card">
            <h2>Статус миграции</h2>
            {status ? (
              <>
                <div className="status-badge" style={{ background: STATUS_COLORS[status.status] }}>
                  {STATUS_LABELS[status.status] || status.status}
                </div>
                {status.step && <div className="current-step">Шаг: <strong>{status.step}</strong></div>}
                {isRunning && (
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${progressPct}%` }} />
                    <span className="progress-label">{progressPct}%</span>
                  </div>
                )}
                {status.startedAt && (
                  <div className="meta">Начато: {new Date(status.startedAt).toLocaleString('ru-RU')}</div>
                )}
                {status.completedAt && (
                  <div className="meta">Завершено: {new Date(status.completedAt).toLocaleString('ru-RU')}</div>
                )}
              </>
            ) : <div className="loading">Загрузка...</div>}
          </div>

          {/* ──────────────────── СДЕЛКИ ДЛЯ ПЕРЕНОСА ──────────────────── */}
          <div className="card batch-card">
            <h2>🎯 Сделки для переноса (международный ОП)</h2>

            {/* Manager analysis */}
            <div className="batch-row">
              <button className="btn btn-secondary" onClick={handleAnalyzeManagers}
                disabled={analyzeLoading || batchLoading}>
                {analyzeLoading ? '⏳ Анализ...' : '🔍 Анализировать менеджеров'}
              </button>
              {batchStats && (
                <span className="batch-meta">
                  Всего сделок в кеше: <b>{batchStats.totalLeads ?? batchStats.totalEligible + (batchStats.totalTransferred ?? 0)}</b>
                </span>
              )}
            </div>

            {managers.length > 0 && (
              <div className="managers-section">
                <div className="managers-label">Выберите менеджеров международного ОП:</div>
                <div className="managers-list">
                  {managers.map(m => (
                    <label key={m.id} className={`manager-item${selectedManagers.includes(m.id) ? ' selected' : ''}`}>
                      <input type="checkbox" checked={selectedManagers.includes(m.id)}
                        onChange={() => toggleManager(m.id)} />
                      <span className="manager-name">{m.name}</span>
                      {m.email && <span className="manager-email">{m.email}</span>}
                      <span className="manager-count">{m.leadCount} сделок</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Stats row */}
            {batchStats && (
              <div className="batch-stats">
                <div className="batch-stat eligible">
                  <div className="batch-stat-val">{batchStats.totalEligible ?? '—'}</div>
                  <div className="batch-stat-lbl">Доступно для переноса</div>
                </div>
                <div className="batch-stat transferred">
                  <div className="batch-stat-val">{batchStats.totalTransferred ?? 0}</div>
                  <div className="batch-stat-lbl">Уже перенесено</div>
                </div>
                <div className="batch-stat remaining">
                  <div className="batch-stat-val">{batchStats.remainingLeads ?? '—'}</div>
                  <div className="batch-stat-lbl">Осталось</div>
                </div>
              </div>
            )}

            {/* Batch size + controls */}
            <div className="batch-controls">
              <div className="batch-size-wrap">
                <label className="batch-size-label">Пакет:</label>
                {[10, 25, 50, 100, 200].map(sz => (
                  <button key={sz}
                    className={`batch-size-btn${batchSize === sz ? ' active' : ''}`}
                    onClick={() => handleBatchSizeChange(sz)}
                    disabled={batchStatus?.status === 'running'}>
                    {sz}
                  </button>
                ))}
              </div>
              <button className="btn btn-primary" onClick={handleStartBatch}
                disabled={batchLoading || batchStatus?.status === 'running' || !batchStats?.remainingLeads}>
                {batchStatus?.status === 'running'
                  ? `⏳ ${batchStatus.step || 'Выполняется...'}`
                  : `🚀 Перенести ${batchSize} сделок`}
              </button>
              <button className="btn btn-warn" onClick={handleBatchRollback}
                disabled={batchLoading || batchStatus?.status === 'running'}>
                ↩ Откатить пакет
              </button>
              <button className="btn btn-secondary" onClick={handleBatchReset}
                disabled={batchLoading || batchStatus?.status === 'running'}>
                🔁 Сбросить счётчик
              </button>
            </div>

            {/* Batch progress */}
            {batchStatus?.status === 'running' && batchStatus.progress?.total > 0 && (
              <div className="progress-bar" style={{ marginTop: 10 }}>
                <div className="progress-fill"
                  style={{ width: `${Math.round((batchStatus.progress.current / batchStatus.progress.total) * 100)}%` }} />
                <span className="progress-label">
                  {batchStatus.progress.current} / {batchStatus.progress.total}
                </span>
              </div>
            )}

            {/* Batch warnings with recommendations */}
            {batchStatus?.warnings?.length > 0 && (
              <div className="batch-warnings">
                <div className="batch-section-title">⚠️ Предупреждения ({batchStatus.warnings.length})</div>
                {batchStatus.warnings.slice(0, 8).map((w, i) => (
                  <div key={i} className="warning-rec-item">
                    <div className="warning-rec-msg">⚠ {w.message}</div>
                    {w.recommendation && (
                      <div className="warning-rec-tip">💡 {w.recommendation}</div>
                    )}
                  </div>
                ))}
                {batchStatus.warnings.length > 8 && (
                  <div className="more">...и ещё {batchStatus.warnings.length - 8} предупреждений</div>
                )}
              </div>
            )}

            {/* Batch errors with recommendations */}
            {batchStatus?.errors?.length > 0 && (
              <div className="batch-errors">
                <div className="batch-section-title">❌ Ошибки ({batchStatus.errors.length})</div>
                {batchStatus.errors.map((e, i) => (
                  <div key={i} className="error-rec-item">
                    <div className="error-rec-msg">✕ {e.message}</div>
                    {e.recommendation && (
                      <div className="error-rec-tip">🔧 {e.recommendation}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Counters — always visible, shows batch + single migration totals */}
          <div className="card counters-card">
            <h2>Перенесено</h2>
            <div className="counters">
              {[
                { label: 'Сделки', key: 'leads', icon: '📋' },
                { label: 'Контакты', key: 'contacts', icon: '👤' },
                { label: 'Компании', key: 'companies', icon: '🏢' },
                { label: 'Задачи', key: 'tasks', icon: '✅' },
                { label: 'Заметки', key: 'notes', icon: '💬' },
              ].map(({ label, key, icon }) => (
                <div className="counter" key={key}>
                  <div className="counter-icon">{icon}</div>
                  <div className="counter-value">
                    {(batchStatus?.createdIds?.[key]?.length || 0) + (status?.createdIds?.[key]?.length || 0)}
                  </div>
                  <div className="counter-label">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Controls */}
          <div className="card controls-card">
            <h2>Управление</h2>
            <div className="controls">
              <button className="btn btn-primary" onClick={handleStart} disabled={loading || isRunning}>
                {isRunning ? '⏳ Выполняется...' : '🚀 Запустить миграцию'}
              </button>
              <button className="btn btn-secondary" onClick={() => handleSyncStages()} disabled={loading || isRunning || syncLoading}>
                🔄 Синхронизировать этапы
              </button>
              <button className="btn btn-refresh" onClick={fetchStatus} disabled={loading}>
                ↻ Обновить статус
              </button>
            </div>
          </div>

          {/* Rollback */}
          <div className="card rollback-card">
            <h2>⏪ Откат</h2>
            <div className="controls">
              <button className="btn btn-danger" onClick={() => handleRollback()} disabled={loading || isRunning}>
                Откатить всё
              </button>
              <button className="btn btn-warn" onClick={() => handleRollback(['leads'])} disabled={loading || isRunning}>
                Откатить сделки
              </button>
              <button className="btn btn-warn" onClick={() => handleRollback(['contacts'])} disabled={loading || isRunning}>
                Откатить контакты
              </button>
              <button className="btn btn-warn" onClick={() => handleRollback(['companies'])} disabled={loading || isRunning}>
                Откатить компании
              </button>
            </div>
          </div>

          {/* Errors */}
          {status?.errors?.length > 0 && (
            <div className="card errors-card">
              <h2>❌ Ошибки ({status.errors.length})</h2>
              <div className="errors-list">
                {status.errors.map((e, i) => (
                  <div key={i} className="error-item">
                    <div className="error-time">{new Date(e.timestamp).toLocaleString('ru-RU')}</div>
                    <div className="error-msg">{e.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {status?.warnings?.length > 0 && (
            <div className="card warnings-card">
              <h2>⚠️ Предупреждения ({status.warnings.length})</h2>
              <div className="errors-list">
                {status.warnings.slice(0, 10).map((w, i) => (
                  <div key={i} className="warning-rec-item">
                    <div className="error-time">{new Date(w.timestamp).toLocaleString('ru-RU')}</div>
                    <div className="warning-rec-msg">{w.message}</div>
                    {w.recommendation && (
                      <div className="warning-rec-tip">💡 Рекомендация: {w.recommendation}</div>
                    )}
                  </div>
                ))}
                {status.warnings.length > 10 && <div className="more">...и ещё {status.warnings.length - 10}</div>}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'pipelines' && (
        <div className="pipelines-tab">

          {/* ── Sync result comparison (shown at top after sync) ── */}
          {syncResult && (
            <div className="sync-result-section">
              <div className="sync-result-header">
                <div className="sync-result-title">✅ Результат синхронизации</div>
                <div className="sync-result-meta">
                  <span className="sync-badge created">+{syncResult.created?.length ?? 0} создано</span>
                  <span className="sync-badge skipped">{syncResult.skipped?.length ?? 0} уже были</span>
                  <span className="sync-badge mapped">{Object.keys(syncResult.stageMapping || {}).length} связей</span>
                </div>
              </div>
              <div className="sync-comparison">
                {/* AMO pipeline */}
                <div className="sync-pipeline-col">
                  <div className="sync-pipeline-header amo-header">
                    📥 amo CRM
                    <span className="sync-pipeline-name">{syncResult.amoPipeline?.name}</span>
                  </div>
                  <div className="sync-stages-list">
                    {(syncResult.amoPipeline?.statuses || [])
                      .filter(s => s.id !== 142 && s.id !== 143)
                      .map((s, i) => {
                        const kommoId = syncResult.stageMapping?.[s.id];
                        return (
                          <div key={s.id} className={`sync-stage${kommoId ? ' mapped' : ' unmapped'}`}>
                            <span className="sync-stage-num">{i + 1}</span>
                            <span className="sync-stage-name">{s.name}</span>
                            {kommoId && <span className="sync-arrow">→</span>}
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Arrow divider */}
                <div className="sync-divider">⇔</div>

                {/* Kommo pipeline */}
                <div className="sync-pipeline-col">
                  <div className="sync-pipeline-header kommo-header">
                    📤 Kommo CRM
                    <span className="sync-pipeline-name">#{syncResult.kommoPipeline?.id}</span>
                  </div>
                  <div className="sync-stages-list">
                    {(() => {
                      const createdSet = new Set((syncResult.created || []).map(n => n.toLowerCase().trim()));
                      return (syncResult.kommoPipeline?.statuses || [])
                        .filter(s => s.id !== 142 && s.id !== 143)
                        .map((s, i) => {
                          const isNew = createdSet.has(s.name.toLowerCase().trim());
                          return (
                            <div key={s.id} className={`sync-stage${isNew ? ' stage-new' : ' stage-exist'}`}>
                              <span className="sync-stage-num">{i + 1}</span>
                              <span className="sync-stage-name">{s.name}</span>
                              {isNew && <span className="sync-stage-badge">NEW</span>}
                            </div>
                          );
                        });
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Pipeline selector + sync button ── */}
          <div className="pipeline-selector-section">
            <div className="pipeline-selector-grid">
              {/* AMO pipelines */}
              <div className="card pipeline-selector-card">
                <h2>📥 amo CRM — выберите воронку</h2>
                {pipelines.amo.length === 0 && <div className="loading">Загрузка...</div>}
                {pipelines.amo.map(p => (
                  <label key={p.id}
                    className={`pipeline-radio-item${selectedAmoPipeline === p.id ? ' selected' : ''}`}>
                    <input type="radio" name="amo-pipeline" value={p.id}
                      checked={selectedAmoPipeline === p.id}
                      onChange={() => { setSelectedAmoPipeline(p.id); setSyncResult(null); }} />
                    <div className="pipeline-radio-info">
                      <div className="pipeline-radio-name">{p.name}</div>
                      <div className="pipeline-radio-meta">
                        #{p.id} · {p._embedded?.statuses?.filter(s => s.id !== 142 && s.id !== 143).length ?? '?'} этапов
                      </div>
                    </div>
                    {selectedAmoPipeline === p.id && (
                      <div className="pipeline-stages-preview">
                        {p._embedded?.statuses
                          ?.filter(s => s.id !== 142 && s.id !== 143)
                          .sort((a, b) => a.sort - b.sort)
                          .map(s => (
                            <div key={s.id} className="stage-item">
                              <span className="stage-sort">{s.sort}</span>
                              <span className="stage-name">{s.name}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </label>
                ))}
              </div>

              {/* Kommo pipelines */}
              <div className="card pipeline-selector-card">
                <h2>📤 Kommo CRM — выберите воронку</h2>
                {pipelines.kommo.length === 0 && <div className="loading">Загрузка...</div>}
                {pipelines.kommo.map(p => (
                  <label key={p.id}
                    className={`pipeline-radio-item${selectedKommoPipeline === p.id ? ' selected' : ''}`}>
                    <input type="radio" name="kommo-pipeline" value={p.id}
                      checked={selectedKommoPipeline === p.id}
                      onChange={() => { setSelectedKommoPipeline(p.id); setSyncResult(null); }} />
                    <div className="pipeline-radio-info">
                      <div className="pipeline-radio-name">{p.name}</div>
                      <div className="pipeline-radio-meta">
                        #{p.id} · {p._embedded?.statuses?.filter(s => s.id !== 142 && s.id !== 143).length ?? '?'} этапов
                      </div>
                    </div>
                    {selectedKommoPipeline === p.id && (
                      <div className="pipeline-stages-preview">
                        {p._embedded?.statuses
                          ?.filter(s => s.id !== 142 && s.id !== 143)
                          .sort((a, b) => a.sort - b.sort)
                          .map(s => (
                            <div key={s.id} className="stage-item">
                              <span className="stage-sort">{s.sort}</span>
                              <span className="stage-name">{s.name}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Sync button */}
            <div className="sync-action-row">
              <button
                className="btn btn-primary btn-sync-big"
                onClick={() => handleSyncStages(selectedAmoPipeline, selectedKommoPipeline)}
                disabled={syncLoading || !selectedAmoPipeline || !selectedKommoPipeline}>
                {syncLoading ? '⏳ Синхронизация...' : '🔄 Синхронизировать этапы'}
              </button>
              {selectedAmoPipeline && selectedKommoPipeline && (
                <span className="sync-selection-hint">
                  {pipelines.amo.find(p => p.id === selectedAmoPipeline)?.name}
                  <span style={{ color: '#64748b', margin: '0 8px' }}>→</span>
                  {pipelines.kommo.find(p => p.id === selectedKommoPipeline)?.name}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'data' && (
        <div className="data-tab">
          {/* Fetch controls */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h2>📥 Загрузка данных из amo CRM</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
              <button className="btn btn-primary" onClick={handleAmoFetch}
                disabled={loading || fetchSt?.status === 'loading'}>
                {fetchSt?.status === 'loading' ? `⏳ ${fetchSt.progress?.step || 'Загрузка...'}` : '⬇️ Загрузить данные'}
              </button>
              {fetchSt?.status === 'done' && (
                <span style={{ color: '#10b981', fontSize: 13 }}>
                  ✅ Данные загружены: {new Date(fetchSt.updatedAt).toLocaleString('ru-RU')}
                </span>
              )}
              {fetchSt?.status === 'error' && (
                <span style={{ color: '#ef4444', fontSize: 13 }}>❌ {fetchSt.error}</span>
              )}
            </div>
            {fetchSt?.status === 'loading' && (
              <div style={{ marginTop: 12, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                {Object.entries(fetchSt.progress?.loaded || {}).map(([k, v]) => (
                  <div key={k} className="counter" style={{ minWidth: 80 }}>
                    <div className="counter-value">{v}</div>
                    <div className="counter-label">{k}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Entity browser */}
          {fetchSt?.status === 'done' && (
            <div className="card">
              <div className="entity-tabs">
                {['leads', 'contacts', 'companies', 'tasks'].map(et => (
                  <button key={et} className={`entity-tab${entityType === et ? ' active' : ''}`}
                    onClick={() => handleEntityTypeChange(et)}>
                    {et === 'leads' ? '📋 Сделки' : et === 'contacts' ? '👤 Контакты' : et === 'companies' ? '🏢 Компании' : '✅ Задачи'}
                    {fetchSt.progress?.loaded?.[et] != null && (
                      <span className="entity-count">{fetchSt.progress.loaded[et]}</span>
                    )}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 12, margin: '12px 0', alignItems: 'center', flexWrap: 'wrap' }}>
                <input className="search-input" placeholder="🔍 Поиск по названию..."
                  value={entitySearch} onChange={handleEntitySearch} />
                {entityType === 'leads' && selectedManagers.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button
                      className={`btn btn-sm${!showOnlyManagerLeads ? ' btn-primary' : ' btn-secondary'}`}
                      style={{ padding: '4px 12px', fontSize: 12 }}
                      onClick={() => handleManagerLeadsToggle(false)}>
                      Все сделки
                    </button>
                    <button
                      className={`btn btn-sm${showOnlyManagerLeads ? ' btn-primary' : ' btn-secondary'}`}
                      style={{ padding: '4px 12px', fontSize: 12 }}
                      onClick={() => handleManagerLeadsToggle(true)}>
                      Менеджеры ОП ({selectedManagers.length})
                    </button>
                  </div>
                )}
                {entityType === 'leads' && selectedManagers.length === 0 && (
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>
                    💡 Выберите менеджеров на дашборде для фильтрации
                  </span>
                )}
              </div>

              {entityLoading ? (
                <div className="loading" style={{ padding: '24px 0' }}>Загрузка...</div>
              ) : amoEntities ? (
                <>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>
                    Итого: {amoEntities.total} · Страница {amoEntities.page} из {amoEntities.pages}
                  </div>
                  <div className="entity-table-wrap">
                    <table className="backups-table">
                      <thead>
                        <tr>
                          <th>#ID</th>
                          <th>Название</th>
                          {entityType === 'leads' && <><th>Этап</th><th>Сумма</th><th>Статус</th></>}
                          {entityType === 'contacts' && <><th>Email/Телефон</th><th>Должность</th></>}
                          {entityType === 'companies' && <><th>Телефон</th><th>Сайт</th></>}
                          {entityType === 'tasks' && <><th>Тип</th><th>Срок</th><th>Выполнено</th></>}
                          <th>Изменён</th>
                        </tr>
                      </thead>
                      <tbody>
                        {amoEntities.items.map((item) => (
                          <tr key={item.id}>
                            <td style={{ fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>{item.id}</td>
                            <td>{item.name || '—'}</td>
                            {entityType === 'leads' && (
                              <><td style={{ fontSize: 12 }}>{item.status_id || '—'}</td>
                              <td>{item.price ? `${item.price.toLocaleString('ru-RU')} ₽` : '—'}</td>
                              <td><span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4,
                                background: item.is_deleted ? '#7f1d1d' : '#14532d', color: 'white' }}>
                                {item.is_deleted ? 'удалён' : 'активен'}</span></td></>
                            )}
                            {entityType === 'contacts' && (
                              <><td style={{ fontSize: 11 }}>{item.custom_fields_values?.find(f => f.field_code === 'EMAIL')?.values?.[0]?.value || item.custom_fields_values?.find(f => f.field_code === 'PHONE')?.values?.[0]?.value || '—'}</td>
                              <td style={{ fontSize: 12 }}>{item.custom_fields_values?.find(f => f.field_name === 'Должность')?.values?.[0]?.value || '—'}</td></>
                            )}
                            {entityType === 'companies' && (
                              <><td style={{ fontSize: 11 }}>{item.custom_fields_values?.find(f => f.field_code === 'PHONE')?.values?.[0]?.value || '—'}</td>
                              <td style={{ fontSize: 11 }}>{item.custom_fields_values?.find(f => f.field_code === 'WEB')?.values?.[0]?.value || '—'}</td></>
                            )}
                            {entityType === 'tasks' && (
                              <><td style={{ fontSize: 12 }}>{item.task_type_id === 1 ? 'Обратный звонок' : item.task_type_id === 2 ? 'Встреча' : `Тип ${item.task_type_id}`}</td>
                              <td style={{ fontSize: 11 }}>{item.complete_till ? new Date(item.complete_till * 1000).toLocaleDateString('ru-RU') : '—'}</td>
                              <td><span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4,
                                background: item.is_completed ? '#14532d' : '#1e3a5f', color: 'white' }}>
                                {item.is_completed ? 'да' : 'нет'}</span></td></>
                            )}
                            <td style={{ fontSize: 11, color: '#64748b' }}>
                              {item.updated_at ? new Date(item.updated_at * 1000).toLocaleDateString('ru-RU') : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {amoEntities.pages > 1 && (
                    <div className="pagination">
                      <button className="btn btn-refresh" onClick={() => handleEntityPage(entityPage - 1)}
                        disabled={entityPage <= 1}>← Назад</button>
                      <span style={{ fontSize: 13, color: '#94a3b8' }}>{entityPage} / {amoEntities.pages}</span>
                      <button className="btn btn-refresh" onClick={() => handleEntityPage(entityPage + 1)}
                        disabled={entityPage >= amoEntities.pages}>Вперёд →</button>
                    </div>
                  )}
                </>
              ) : (
                <div className="no-data">Нажмите «Загрузить данные» для получения сущностей из amo CRM.</div>
              )}
            </div>
          )}

          {(!fetchSt || fetchSt.status === 'idle') && (
            <div className="card">
              <div className="no-data">Данные ещё не загружены. Нажмите «Загрузить данные» выше.</div>
            </div>
          )}
        </div>
      )}

      {tab === 'fields' && (
        <FieldSync />
      )}

      {tab === 'backups' && (
        <div className="card">
          <h2>💾 Резервные копии</h2>
          {backups.length === 0 ? (
            <div className="no-data">Резервных копий пока нет. Они создаются автоматически перед каждой миграцией.</div>
          ) : (
            <table className="backups-table">
              <thead>
                <tr><th>Файл</th><th>Размер</th><th>Создан</th></tr>
              </thead>
              <tbody>
                {backups.map((b, i) => (
                  <tr key={i}>
                    <td className="backup-file">{b.file}</td>
                    <td>{(b.size / 1024).toFixed(1)} KB</td>
                    <td>{new Date(b.created).toLocaleString('ru-RU')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
