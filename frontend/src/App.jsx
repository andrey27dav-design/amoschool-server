import { useState, useEffect, useCallback } from 'react';
import * as api from './api';
import './App.css';
import FieldSync from './FieldSync';
import CopyDeals from './CopyDeals';

const APP_VERSION = 'V1.0.0';

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
  { step: 1, title: 'Синхронизация этапов воронки', desc: 'Вкладка «Воронки» → выберите воронку из amo CRM и воронку в Kommo → нажмите «Синхронизировать этапы». Система создаст в Kommo CRM все этапы из воронки Школа/Репетиторство. ID этапов сохраняются в базу для корректного переноса сделок.' },
  { step: 2, title: 'Сопоставление менеджеров', desc: 'Вкладка «Менеджеры» → выберите менеджера из amo CRM слева и соответствующего менеджера Kommo справа → нажмите «Сопоставить». Повторите для каждого менеджера.' },
  { step: 3, title: 'Синхронизация кастомных полей', desc: 'Вкладка «Поля» → загрузите анализ полей → выберите поля со статусом «Нет в Kommo» или «Частично» → нажмите «Создать выбранные».' },
  { step: 4, title: 'Загрузка данных из amo CRM', desc: 'Дашборд → нажмите «Загрузить данные». Все сделки, контакты, компании и задачи будут загружены в кэш. Счётчик «Для переноса» покажет количество доступных записей.' },
  { step: 5, title: 'Пакетный перенос сделок', desc: 'Выберите размер пакета (10–200 или ВСЕ). Нажмите «Перенести». Система переносит сделки пакетами — компании → контакты → сделки → задачи → комментарии. Счётчик «Перенесено» обновляется после каждого пакета.' },
  { step: 6, title: 'Резервная копия', desc: 'Создаётся автоматически перед каждой миграцией (вкладка «Бэкапы»). Исходные данные в amo CRM НЕ удаляются автоматически.' },
];

export default function App() {
  const [status, setStatus] = useState(null);
  const [pipelines, setPipelines] = useState({ amo: [], kommo: [] });
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState('dashboard');
  const [helpOpen, setHelpOpen] = useState(false);

  // AMO data fetch state (dashboard)
  const [fetchSt, setFetchSt] = useState(null);

  // Batch migration state
  const [batchStats, setBatchStats] = useState(null);
  const [batchStatus, setBatchStatusData] = useState(null);
  const [selectedManagers, setSelectedManagers] = useState([]);
  const [batchSize, setBatchSize] = useState(10);
  const [batchLoading, setBatchLoading] = useState(false);

  // Single deals transfer state
  const [dealsList, setDealsList] = useState([]);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [selectedDealIds, setSelectedDealIds] = useState(new Set());
  const [singleTransferLoading, setSingleTransferLoading] = useState(false);
  const [singleTransferResult, setSingleTransferResult] = useState(null);
  const [dealsManagersMap, setDealsManagersMap] = useState({});
  const [dealsSearch, setDealsSearch] = useState('');

  // Pipeline selector state — persist across tab-switches and page reloads
  const [selectedAmoPipeline, setSelectedAmoPipeline] = useState(() => {
    const s = localStorage.getItem('pipeline_amo');
    return s ? parseInt(s) : null;
  });
  const [selectedKommoPipeline, setSelectedKommoPipeline] = useState(() => {
    const s = localStorage.getItem('pipeline_kommo');
    return s ? parseInt(s) : null;
  });
  const [syncResult, setSyncResult] = useState(() => {
    try {
      const s = sessionStorage.getItem('syncResult');
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  });
  const [syncLoading, setSyncLoading] = useState(false);
  const [savedStageMapping, setSavedStageMapping] = useState([]);

  // Managers tab state
  const [amoManagersList, setAmoManagersList] = useState([]);
  const [kommoUsers, setKommoUsers] = useState([]);
  const [managerMapping, setManagerMapping] = useState([]);
  const [selectedAmoUser, setSelectedAmoUser] = useState(null);
  const [selectedKommoUser, setSelectedKommoUser] = useState(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [managersLoaded, setManagersLoaded] = useState(false);
  const [recentMatch, setRecentMatch] = useState(null);

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
      setSelectedAmoPipeline(prev => {
        const id = prev ?? (amo[0]?.id ?? null);
        if (id) localStorage.setItem('pipeline_amo', id);
        return id;
      });
      setSelectedKommoPipeline(prev => {
        const id = prev ?? (kommo[0]?.id ?? null);
        if (id) localStorage.setItem('pipeline_kommo', id);
        return id;
      });
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
  }, []);

  // Load saved stage mapping from DB whenever pipeline pair changes
  const loadSavedStageMapping = useCallback(async (amoPipelineId, kommoPipelineId) => {
    if (!amoPipelineId || !kommoPipelineId) return;
    try {
      const data = await api.getStageMappingDB(amoPipelineId, kommoPipelineId);
      setSavedStageMapping(data.stages || []);
    } catch (e) {
      console.error('loadSavedStageMapping error:', e);
    }
  }, []);

  useEffect(() => {
    if (tab === 'pipelines' && selectedAmoPipeline && selectedKommoPipeline) {
      loadSavedStageMapping(selectedAmoPipeline, selectedKommoPipeline);
    }
  }, [tab, selectedAmoPipeline, selectedKommoPipeline]);

  // Build paired rows from syncResult stageMapping
  const buildStagePairs = (syncRes, amoSt, kommoSt) => {
    if (!syncRes?.stageMapping) return [];
    return Object.entries(syncRes.stageMapping).map(([amoIdStr, kommoId]) => {
      const amoId = parseInt(amoIdStr);
      const amoStage = amoSt.find(s => s.id === amoId);
      const kommoStage = kommoSt.find(s => s.id === kommoId);
      return { amoId, kommoId, amoName: amoStage?.name || amoIdStr, kommoName: kommoStage?.name || String(kommoId), isSystem: amoId === 142 || amoId === 143 };
    }).sort((a, b) => {
      if (a.isSystem && !b.isSystem) return 1;
      if (!a.isSystem && b.isSystem) return -1;
      const aStage = amoSt.find(s => s.id === a.amoId);
      const bStage = amoSt.find(s => s.id === b.amoId);
      return (aStage?.sort || 0) - (bStage?.sort || 0);
    });
  };

  // Export mapping as CSV
  const downloadMappingCSV = (pairs, amoPipeName, kommoPipeName) => {
    const header = '#,AMO этап,AMO ID,Kommo этап,Kommo ID,Статус';
    const rows = pairs.map((p, i) => `${i + 1},"${p.amoName}",${p.amoId},"${p.kommoName}",${p.kommoId},${p.kommoId ? 'OK' : 'Нет пары'}`);
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stage_mapping_${amoPipeName}_${kommoPipeName}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadManagerMappingCSV = (mappings) => {
    const header = '#,AMO менеджер,AMO ID,AMO Email,Kommo пользователь,Kommo ID,Kommo Email';
    const rows = mappings.map((m, i) =>
      `${i + 1},"${m.amo_user_name}",${m.amo_user_id},"${m.amo_email || ''}","${m.kommo_user_name}",${m.kommo_user_id},"${m.kommo_email || ''}"`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `manager_mapping_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Auto-poll while amo data is loading
  useEffect(() => {
    if (fetchSt?.status !== 'loading') return;
    const iv = setInterval(() => {
      api.getAmoFetchStatus().then(s => {
        setFetchSt(s);
        if (s.status !== 'loading') clearInterval(iv);
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

  const handleAmoFetch = async () => {
    // Подгружаем маппинги менеджеров если ещё не загружены
    let mapping = managerMapping;
    if (mapping.length === 0) {
      try {
        const res = await api.getManagerMapping();
        mapping = res.mappings || [];
        setManagerMapping(mapping);
      } catch (e) {
        mapping = [];
      }
    }

    // Берём AMO-менеджеров из маппинга (те, для кого задан ответственный в Kommo)
    const mappedAmoIds = mapping.map(m => m.amo_user_id).filter(Boolean);

    const pipeLabel = selectedAmoPipeline
      ? (pipelines.amo.find(p => p.id === selectedAmoPipeline)?.name || selectedAmoPipeline)
      : 'все воронки';
    const mgrLabel = mappedAmoIds.length > 0
      ? `${mappedAmoIds.length} менеджер(а) из вкладки Менеджеры`
      : 'все менеджеры (маппинг не настроен)';

    if (!confirm(`Загрузить данные из amo CRM?\nВоронка: ${pipeLabel}\nМенеджеры: ${mgrLabel}\n\nЭто может занять несколько минут.`)) return;
    setLoading(true);
    setMessage('');
    try {
      await api.triggerAmoFetch(selectedAmoPipeline, mappedAmoIds);
      setMessage('⏳ Загрузка данных из amo CRM запущена...');
      const s = await api.getAmoFetchStatus();
      setFetchSt(s);
    } catch (e) {
      setMessage(`❌ Ошибка: ${e.response?.data?.error || e.message}`);
    }
    setLoading(false);
  };

  const handleSyncStages = async (amoPipelineId, kommoPipelineId) => {
    setSyncLoading(true);
    setMessage('');
    try {
      const result = await api.syncStages(amoPipelineId, kommoPipelineId);
      setSyncResult(result);
      try { sessionStorage.setItem('syncResult', JSON.stringify(result)); } catch {}
      const created = result.created?.length ?? 0;
      const skipped = result.skipped?.length ?? 0;
      setMessage(`✅ Синхронизация завершена: создано ${created} этапов, ${skipped} уже существовали`);

      // Persist stage mapping to DB
      if (result.stageMapping && amoPipelineId && kommoPipelineId) {
        const amoPipeline = pipelines.amo.find(p => p.id === amoPipelineId);
        const kommoPipeline = result.kommoPipeline;
        const stages = Object.entries(result.stageMapping).map(([amoStageId, kommoStageId]) => {
          const amoStage = amoPipeline?._embedded?.statuses?.find(s => s.id === parseInt(amoStageId));
          const kommoStage = (kommoPipeline?.statuses || result.kommoPipeline?._embedded?.statuses || [])
            .find(s => s.id === kommoStageId);
          return {
            amo_stage_id: parseInt(amoStageId),
            kommo_stage_id: kommoStageId,
            amo_stage_name: amoStage?.name || null,
            kommo_stage_name: kommoStage?.name || null,
          };
        });
        if (stages.length > 0) {
          await api.saveStageMappingDB(amoPipelineId, kommoPipelineId, stages).catch(err =>
            console.warn('Stage mapping DB save error:', err)
          );
          // Refresh saved mapping display
          loadSavedStageMapping(amoPipelineId, kommoPipelineId);
        }
      }
    } catch (e) {
      setMessage(`❌ Ошибка: ${e.response?.data?.error || e.message}`);
    }
    setSyncLoading(false);
    setLoading(false);
  };

  // ─── Managers tab handlers ─────────────────────────────────────────────────
  const loadManagersTab = useCallback(async () => {
    if (managersLoaded) return;
    try {
      const [amoRes, kommoRes, mappingRes] = await Promise.all([
        api.getAmoManagers().catch(() => ({ managers: [] })),
        api.getKommoUsers().catch(() => ({ users: [] })),
        api.getManagerMapping().catch(() => ({ mappings: [] })),
      ]);
      setAmoManagersList(amoRes.managers || []);
      setKommoUsers(kommoRes.users || []);
      setManagerMapping(mappingRes.mappings || []);
      setManagersLoaded(true);
    } catch (e) {
      console.error('loadManagersTab error:', e);
    }
  }, [managersLoaded]);

  useEffect(() => {
    if (tab === 'managers') loadManagersTab();
  }, [tab]);

  const handleMatchManager = async () => {
    if (!selectedAmoUser || !selectedKommoUser) {
      setMessage('❌ Выберите менеджера из amo CRM и менеджера Kommo');
      return;
    }
    setMatchLoading(true);
    try {
      await api.matchManager({
        amo_user_id: selectedAmoUser.amo_id,
        amo_user_name: selectedAmoUser.amo_name,
        amo_email: selectedAmoUser.amo_email,
        kommo_user_id: selectedKommoUser.id,
        kommo_user_name: selectedKommoUser.name,
        kommo_email: selectedKommoUser.email,
      });
      const savedAmoId = selectedAmoUser.amo_id;
      const res = await api.getManagerMapping();
      setManagerMapping(res.mappings || []);
      setSelectedAmoUser(null);
      setSelectedKommoUser(null);
      setRecentMatch(savedAmoId);
      setTimeout(() => setRecentMatch(null), 5000);
      setMessage(`✅ Сопоставлено: ${selectedAmoUser.amo_name} → ${selectedKommoUser.name}`);
    } catch (e) {
      setMessage(`❌ Ошибка сопоставления: ${e.response?.data?.error || e.message}`);
    }
    setMatchLoading(false);
  };

  const handleDeleteMatch = async (amoUserId) => {
    if (!confirm('Удалить сопоставление?')) return;
    try {
      await api.deleteManagerMatch(amoUserId);
      setManagerMapping(prev => prev.filter(m => m.amo_user_id !== amoUserId));
    } catch (e) {
      setMessage(`❌ ${e.response?.data?.error || e.message}`);
    }
  };

  // ─── Batch migration handlers ──────────────────────────────────────────────
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

  const tabLabel = (t) => {
    switch (t) {
      case 'dashboard': return '📊 Дашборд';
      case 'pipelines': return '🔀 Воронки';
      case 'managers':  return '👥 Менеджеры';
      case 'fields':    return '🔧 Поля';
      case 'copy':      return '🚀 Копирование';
      case 'backups':   return '💾 Бэкапы';
      default: return t;
    }
  };

  return (
    <div className="app">
      <div style={{ position: 'fixed', top: 8, left: 8, zIndex: 9999, background: 'rgba(30,30,40,0.78)', color: '#a5b4fc', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, letterSpacing: '0.05em', pointerEvents: 'none', backdropFilter: 'blur(4px)', border: '1px solid rgba(165,180,252,0.2)' }}>{APP_VERSION}</div>
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
                ⚠️ Рекомендуемый порядок: Воронки → Менеджеры → Поля → Дашборд (загрузить данные → пакетный перенос)
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
                <p>Кнопка «↩ Откатить пакет» отменяет последний перенесённый пакет сделок. Кнопка «Откатить всё» откатывает всю одиночную миграцию.</p>
              </div>
              <div className="plan-section">
                <h3>📦 Вкладки панели</h3>
                <ul>
                  <li><strong>📊 Дашборд</strong> — загрузка данных, пакетный перенос, счётчики, откат</li>
                  <li><strong>🔀 Воронки</strong> — синхронизация этапов воронок (amo ↔ Kommo)</li>
                  <li><strong>👥 Менеджеры</strong> — сопоставление менеджеров amo CRM и Kommo CRM</li>
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
        {['dashboard', 'pipelines', 'managers', 'fields', 'copy', 'backups'].map(t => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {tabLabel(t)}
          </button>
        ))}
      </nav>

      {message && <div className="message">{message}</div>}

      {/* ═══════════════════════════ DASHBOARD ═══════════════════════════════ */}
      {tab === 'dashboard' && (
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          <div className="dashboard" style={{ flex: '1 1 auto', minWidth: 0 }}>
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

          {/* ──────────────────── BATCH CARD ──────────────────── */}
          <div className="card batch-card">
            <h2>🎯 Пакетный перенос</h2>

            {/* Load data button */}
            <div className="batch-row">
              <button className="btn btn-secondary" onClick={handleAmoFetch}
                disabled={loading || fetchSt?.status === 'loading'}>
                {fetchSt?.status === 'loading'
                  ? `⏳ ${fetchSt.progress?.step || 'Загрузка...'}`
                  : '⬇️ Загрузить данные'}
              </button>
              {fetchSt?.status === 'done' && (
                <span style={{ color: '#10b981', fontSize: 13 }}>
                  ✅ Данные загружены: {new Date(fetchSt.updatedAt).toLocaleString('ru-RU')}
                </span>
              )}
              {fetchSt?.status === 'error' && (
                <span style={{ color: '#ef4444', fontSize: 13 }}>❌ {fetchSt.error}</span>
              )}
              {batchStats && (
                <span className="batch-meta">
                  Всего сделок в кеше: <b>{batchStats.totalLeads ?? ((batchStats.totalEligible || 0) + (batchStats.totalTransferred || 0))}</b>
                </span>
              )}
            </div>

            {/* Loading progress */}
            {fetchSt?.status === 'loading' && (() => {
              const LABELS = {
                leads: 'Сделки', contacts: 'Контакты', companies: 'Компании',
                leadTasks: 'Задачи (сделки)', contactTasks: 'Задачи (контакты)',
                leadNotes: 'Комм. (сделки)', contactNotes: 'Комм. (контакты)',
              };
              return (
                <div style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {Object.entries(fetchSt.progress?.loaded || {}).map(([k, v]) => (
                    <div key={k} className="counter" style={{ minWidth: 80 }}>
                      <div className="counter-value">{v}</div>
                      <div className="counter-label">{LABELS[k] || k}</div>
                    </div>
                  ))}
                </div>
              );
            })()}

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
                <button
                  className={`batch-size-btn${batchSize === 0 ? ' active' : ''}`}
                  onClick={() => handleBatchSizeChange(0)}
                  disabled={batchStatus?.status === 'running'}>
                  ВСЕ
                </button>
              </div>
              <button className="btn btn-primary" onClick={handleStartBatch}
                disabled={batchLoading || batchStatus?.status === 'running' || !batchStats?.remainingLeads}>
                {batchStatus?.status === 'running'
                  ? `⏳ ${batchStatus.step || 'Выполняется...'}`
                  : batchSize === 0
                    ? '🚀 Перенести ВСЕ сделки'
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

            {/* Batch warnings */}
            {batchStatus?.warnings?.length > 0 && (
              <div className="batch-warnings">
                <div className="batch-section-title">⚠️ Предупреждения ({batchStatus.warnings.length})</div>
                {batchStatus.warnings.slice(0, 8).map((w, i) => (
                  <div key={i} className="warning-rec-item">
                    <div className="warning-rec-msg">⚠ {w.message}</div>
                    {w.recommendation && <div className="warning-rec-tip">💡 {w.recommendation}</div>}
                  </div>
                ))}
                {batchStatus.warnings.length > 8 && (
                  <div className="more">...и ещё {batchStatus.warnings.length - 8} предупреждений</div>
                )}
              </div>
            )}

            {/* Batch errors */}
            {batchStatus?.errors?.length > 0 && (
              <div className="batch-errors">
                <div className="batch-section-title">❌ Ошибки ({batchStatus.errors.length})</div>
                {batchStatus.errors.map((e, i) => (
                  <div key={i} className="error-rec-item">
                    <div className="error-rec-msg">✕ {e.message}</div>
                    {e.recommendation && <div className="error-rec-tip">🔧 {e.recommendation}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ──────────────────── ДЛЯ ПЕРЕНОСА ──────────────────── */}
          {fetchSt?.status === 'done' && fetchSt.progress?.loaded && (
            <div className="card counters-card">
              <h2>📦 Для переноса (загружено из amo CRM)</h2>
              <div className="counters">
                {[
                  { label: 'Сделки',              key: 'leads',        icon: '📋' },
                  { label: 'Контакты',            key: 'contacts',     icon: '👤' },
                  { label: 'Компании',            key: 'companies',    icon: '🏢' },
                  { label: 'Задачи (сделки)',     key: 'leadTasks',    icon: '✅' },
                  { label: 'Задачи (контакты)',   key: 'contactTasks', icon: '✅' },
                  { label: 'Комментарии (сделки)',    key: 'leadNotes',    icon: '💬' },
                  { label: 'Комментарии (контакты)', key: 'contactNotes', icon: '💬' },
                ].map(({ label, key, icon }) => (
                  <div className="counter" key={key}>
                    <div className="counter-icon">{icon}</div>
                    <div className="counter-value">{fetchSt.progress.loaded[key] ?? 0}</div>
                    <div className="counter-label">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ──────────────────── ПЕРЕНЕСЕНО ──────────────────── */}
          <div className="card counters-card">
            <h2>✅ Перенесено</h2>
            <div className="counters">
              {[
                { label: 'Сделки',   key: 'leads',     icon: '📋' },
                { label: 'Контакты', key: 'contacts',  icon: '👤' },
                { label: 'Компании', key: 'companies', icon: '🏢' },
                { label: 'Задачи',   key: 'tasks',     icon: '✅' },
                { label: 'Заметки',  key: 'notes',     icon: '💬' },
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
          </div>{/* /dashboard column */}

          {/* ═══ Панель тонкого переноса (правая колонка) ═══════════════════ */}
          <div className="card" style={{ width: 400, flexShrink: 0, position: 'sticky', top: 16 }}>
            <h2 style={{ marginTop: 0 }}>🎯 Тонкий перенос</h2>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-muted)' }}>
              Выберите конкретные сделки из кэша AMO для переноса в Kommo.
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <button
                className="btn"
                onClick={async () => {
                  setDealsLoading(true);
                  setSingleTransferResult(null);
                  setDealsSearch('');
                  try {
                    const dl = await api.getDealsList();
                    setDealsList(dl.leads || []);
                    setSelectedDealIds(new Set());
                  } catch (e) {
                    alert('Ошибка загрузки: ' + (e.response?.data?.error || e.message));
                  } finally {
                    setDealsLoading(false);
                  }
                }}
                disabled={dealsLoading}
              >
                {dealsLoading ? '⏳ Загрузка...' : '🔄 Загрузить список'}
              </button>
              {dealsList.length > 0 && (
                <>
                  <button className="btn" style={{ fontSize: 12 }} onClick={() => {
                    const q = dealsSearch.trim().toLowerCase();
                    const visible = q ? dealsList.filter(d =>
                      (d.name||'').toLowerCase().includes(q) || String(d.id).includes(q) ||
                      (d.contact_name||'').toLowerCase().includes(q) || (d.company_name||'').toLowerCase().includes(q)
                    ) : dealsList;
                    setSelectedDealIds(new Set(visible.map(d => d.id)));
                  }}>
                    ✅ Все
                  </button>
                  <button className="btn" style={{ fontSize: 12 }} onClick={() => setSelectedDealIds(new Set())}>
                    ☐ Снять
                  </button>
                </>
              )}
            </div>

            {/* Поиск */}
            {dealsList.length > 0 && (
              <input
                type="text"
                placeholder="🔍 Поиск по названию, ID, контакту, компании..."
                value={dealsSearch}
                onChange={e => setDealsSearch(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box', marginBottom: 8,
                  padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
                  fontSize: 13, background: 'var(--bg)', color: 'var(--text)',
                }}
              />
            )}

            {dealsList.length === 0 && !dealsLoading && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '8px 0 16px' }}>
                Нажмите «Загрузить список» для отображения сделок из кэша AMO.<br />
                Если кэш пуст — сначала загрузите данные на вкладке «Данные AMO».
              </div>
            )}

            {dealsList.length > 0 && (() => {
              const q = dealsSearch.trim().toLowerCase();
              const filteredDeals = q
                ? dealsList.filter(d =>
                    (d.name||'').toLowerCase().includes(q) || String(d.id).includes(q) ||
                    (d.contact_name||'').toLowerCase().includes(q) || (d.company_name||'').toLowerCase().includes(q))
                : dealsList;
              return (
              <>
              <div style={{ marginBottom: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                {q ? `Найдено: ${filteredDeals.length} из ${dealsList.length}` : `Всего: ${dealsList.length}`}
              </div>
              <div style={{ maxHeight: 400, overflowY: 'auto', marginBottom: 12, border: '1px solid var(--border)', borderRadius: 6 }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary, #f3f4f6)', position: 'sticky', top: 0, zIndex: 1 }}>
                      <th style={{ padding: '6px 6px', width: 26 }}></th>
                      <th style={{ padding: '6px 6px', textAlign: 'left' }}>Сделка</th>
                      <th style={{ padding: '6px 6px', textAlign: 'left' }}>Контакт / Компания</th>
                      <th style={{ padding: '6px 6px', textAlign: 'left' }}>Этап</th>
                      <th style={{ padding: '6px 6px', textAlign: 'right' }}>₽</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDeals.map(d => (
                      <tr
                        key={d.id}
                        style={{
                          borderBottom: '1px solid var(--border, #e5e7eb)',
                          background: selectedDealIds.has(d.id) ? 'rgba(59,130,246,.1)' : 'transparent',
                          cursor: 'pointer',
                        }}
                        onClick={() => {
                          const next = new Set(selectedDealIds);
                          if (next.has(d.id)) next.delete(d.id); else next.add(d.id);
                          setSelectedDealIds(next);
                        }}
                      >
                        <td style={{ padding: '4px 6px' }}>
                          <input type="checkbox" checked={selectedDealIds.has(d.id)} onChange={() => {}} style={{ pointerEvents: 'none' }} />
                        </td>
                        <td style={{ padding: '4px 6px', maxWidth: 120 }}>
                          <div style={{ fontWeight: 500, wordBreak: 'break-word', lineHeight: 1.3 }}>{d.name}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>ID: {d.id}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>👤 {d.responsible_name}</div>
                        </td>
                        <td style={{ padding: '4px 6px', fontSize: 11, maxWidth: 110 }}>
                          {d.contact_name && <div style={{ wordBreak: 'break-word' }}>👤 {d.contact_name}</div>}
                          {d.company_name && <div style={{ color: 'var(--text-muted)', wordBreak: 'break-word' }}>🏢 {d.company_name}</div>}
                          {!d.contact_name && !d.company_name && <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>
                        <td style={{ padding: '4px 6px', fontSize: 10, maxWidth: 80, wordBreak: 'break-word' }}>
                          {d.stage_name}
                        </td>
                        <td style={{ padding: '4px 6px', textAlign: 'right', whiteSpace: 'nowrap', fontSize: 11 }}>
                          {d.price > 0 ? d.price.toLocaleString('ru-RU') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
              );
            })()}

            {dealsList.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border, #e5e7eb)', paddingTop: 12 }}>
                <div style={{ marginBottom: 8, fontSize: 13 }}>
                  Выбрано: <strong>{selectedDealIds.size}</strong> из {dealsList.length}
                </div>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  disabled={selectedDealIds.size === 0 || singleTransferLoading}
                  onClick={async () => {
                    if (!window.confirm('Перенести ' + selectedDealIds.size + ' сделок в Kommo CRM?')) return;
                    setSingleTransferLoading(true);
                    setSingleTransferResult(null);
                    try {
                      const sm = status?.stageMapping || {};
                      const res = await api.transferDeals([...selectedDealIds], sm);
                      setSingleTransferResult(res);
                    } catch (e) {
                      setSingleTransferResult({ error: e.response?.data?.error || e.message });
                    } finally {
                      setSingleTransferLoading(false);
                    }
                  }}
                >
                  {singleTransferLoading
                    ? '⏳ Переносим...'
                    : '🚀 Перенести ' + (selectedDealIds.size > 0 ? selectedDealIds.size + ' сделок' : '')}
                </button>

                {singleTransferResult && (
                  <div style={{
                    marginTop: 12, fontSize: 12, borderRadius: 6, padding: 10,
                    background: singleTransferResult.error ? 'rgba(239,68,68,.1)' : 'rgba(16,185,129,.1)',
                  }}>
                    {singleTransferResult.error ? (
                      <div>❌ Ошибка: {singleTransferResult.error}</div>
                    ) : (
                      <>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>✅ Перенос завершён</div>
                        <div>Сделок перенесено: <strong>{singleTransferResult.transferred?.leads}</strong> / запрошено {singleTransferResult.requested}</div>
                        <div>Контактов: {singleTransferResult.transferred?.contacts}</div>
                        <div>Компаний: {singleTransferResult.transferred?.companies}</div>
                        <div>
                          <div style={{ marginBottom: 2 }}><strong>Задачи:</strong> {singleTransferResult.transferred?.tasks} перенесено</div>
                          {singleTransferResult.tasksDetail ? (
                            <div style={{ marginLeft: 12, fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
                              <div>🔹 Сделки: найдено {singleTransferResult.tasksDetail.leads?.found ?? '—'}, перенесено <strong>{singleTransferResult.tasksDetail.leads?.created ?? '—'}</strong></div>
                              <div>🔹 Контакты: найдено {singleTransferResult.tasksDetail.contacts?.found ?? '—'}, перенесено <strong>{singleTransferResult.tasksDetail.contacts?.created ?? '—'}</strong></div>
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, color: '#6b7280' }}>(задачи сделок из кэша)</div>
                          )}
                        </div>
                        <div style={{ marginTop: 4 }}>
                          <div><strong>Заметки:</strong> {singleTransferResult.transferred?.notes} перенесено</div>
                          {singleTransferResult.notesDetail ? (
                            <div style={{ marginLeft: 12, fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
                              <div>🔹 Сделки: скачано {singleTransferResult.notesDetail.leads?.fetched ?? '—'}, перенесено <strong>{singleTransferResult.notesDetail.leads?.transferred ?? '—'}</strong></div>
                              <div>🔹 Контакты: скачано {singleTransferResult.notesDetail.contacts?.fetched ?? '—'}, перенесено <strong>{singleTransferResult.notesDetail.contacts?.transferred ?? '—'}</strong></div>
                              <div>🔹 Компании: скачано {singleTransferResult.notesDetail.companies?.fetched ?? '—'}, перенесено <strong>{singleTransferResult.notesDetail.companies?.transferred ?? '—'}</strong></div>
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, color: '#6b7280' }}>(Заметки сделки + контакты)</div>
                          )}
                        </div>
                        {singleTransferResult.skipped?.leads > 0 && (
                          <div style={{ marginTop: 4 }}>⚠️ Пропущено (уже перенесены): {singleTransferResult.skipped.leads}</div>
                        )}
                        {singleTransferResult.errors?.length > 0 && (
                          <div style={{ marginTop: 6 }}>
                            <div style={{ fontWeight: 600, color: '#ef4444' }}>Ошибки:</div>
                            {singleTransferResult.errors.map((e, i) => <div key={i}>• {e}</div>)}
                          </div>
                        )}
                        {singleTransferResult.warnings?.length > 0 && (
                          <details style={{ marginTop: 6 }}>
                            <summary style={{ cursor: 'pointer' }}>⚠️ Предупреждения ({singleTransferResult.warnings.length})</summary>
                            {singleTransferResult.warnings.map((w, i) => <div key={i} style={{ paddingLeft: 8 }}>• {w}</div>)}
                          </details>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════ ВОРОНКИ ═══════════════════════════════ */}
      {tab === 'pipelines' && (
        <div className="pipelines-tab">

          {/* ── Stage mapping table (from sync result OR saved DB) ── */}
          {(() => {
            const amoSt = pipelines.amo.find(p => p.id === selectedAmoPipeline)?._embedded?.statuses || [];
            const kommoSt = pipelines.kommo.find(p => p.id === selectedKommoPipeline)?._embedded?.statuses || [];
            const amoPipeName = pipelines.amo.find(p => p.id === selectedAmoPipeline)?.name || '';
            const kommoPipeName = pipelines.kommo.find(p => p.id === selectedKommoPipeline)?.name || '';

            // Use live syncResult if available, otherwise fall back to DB saved mapping
            let pairs = [];
            let source = null;
            if (syncResult?.stageMapping) {
              pairs = buildStagePairs(syncResult, amoSt, kommoSt);
              source = 'sync';
            } else if (savedStageMapping.length > 0) {
              pairs = savedStageMapping.map((r, i) => ({
                amoId: r.amo_stage_id,
                kommoId: r.kommo_stage_id,
                amoName: r.amo_stage_name || String(r.amo_stage_id),
                kommoName: r.kommo_stage_name || String(r.kommo_stage_id),
                isSystem: r.amo_stage_id === 142 || r.amo_stage_id === 143,
              }));
              source = 'db';
            }

            if (pairs.length === 0) return null;

            const mappedCount = pairs.filter(p => p.kommoId).length;
            const unmappedCount = pairs.filter(p => !p.kommoId).length;
            const createdSet = new Set((syncResult?.created || []).map(n => n.toLowerCase().trim()));

            return (
              <div className="sync-result-section">
                <div className="sync-result-header">
                  <div className="sync-result-title">
                    {source === 'sync' ? '✅ Результат синхронизации' : '💾 Сохранённое сопоставление этапов'}
                  </div>
                  <div className="sync-result-meta">
                    {source === 'sync' && <>
                      <span className="sync-badge created">+{syncResult.created?.length ?? 0} создано</span>
                      <span className="sync-badge skipped">{syncResult.skipped?.length ?? 0} уже были</span>
                    </>}
                    <span className="sync-badge mapped">✅ {mappedCount} сопоставлено</span>
                    {unmappedCount > 0 && <span className="sync-badge" style={{ background: '#dc2626' }}>❌ {unmappedCount} без пары</span>}
                    <span className="sync-badge mapped" style={{ background: '#1d4ed8' }}>💾 ID в БД</span>
                  </div>
                </div>

                {/* Paired mapping table */}
                <div className="stage-mapping-table-wrap">
                  <table className="stage-mapping-table">
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}>#</th>
                        <th>📥 Этап AMO ({amoPipeName})</th>
                        <th style={{ width: 32 }}></th>
                        <th>📤 Этап Kommo ({kommoPipeName})</th>
                        <th style={{ width: 60 }}>Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pairs.map((p, i) => {
                        const isNew = createdSet.has(p.kommoName?.toLowerCase().trim());
                        return (
                          <tr key={p.amoId} className={p.isSystem ? 'stage-row-system' : ''}>
                            <td className="stage-num">{i + 1}</td>
                            <td className="stage-cell amo-cell">
                              <span className="stage-name-text">{p.amoName}</span>
                              <span className="stage-id-badge">{p.amoId}</span>
                            </td>
                            <td className="stage-arrow-cell">→</td>
                            <td className="stage-cell kommo-cell">
                              {p.kommoId ? (
                                <>
                                  <span className="stage-name-text">{p.kommoName}</span>
                                  <span className="stage-id-badge kommo">{p.kommoId}</span>
                                  {isNew && <span className="sync-stage-badge" style={{ marginLeft: 6 }}>NEW</span>}
                                </>
                              ) : (
                                <span style={{ color: '#ef4444', fontStyle: 'italic' }}>— не найдено —</span>
                              )}
                            </td>
                            <td className="stage-status-cell">
                              {p.kommoId ? '✅' : '❌'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Footnote / CSV download */}
                <div className="stage-mapping-footnote">
                  <span className="stage-mapping-footnote-text">
                    Таблица сопоставления этапов: {amoPipeName} → {kommoPipeName} · {pairs.length} строк · {mappedCount} совпадений
                  </span>
                  <button
                    className="btn btn-secondary btn-sm stage-mapping-download"
                    onClick={() => downloadMappingCSV(pairs, amoPipeName, kommoPipeName)}>
                    ⬇ Скачать (.csv)
                  </button>
                </div>
              </div>
            );
          })()}

          <div className="pipeline-selector-section">
            <div className="pipeline-selector-grid">
              <div className="card pipeline-selector-card">
                <h2>📥 amo CRM — выберите воронку</h2>
                {pipelines.amo.length === 0 && <div className="loading">Загрузка...</div>}
                {pipelines.amo.map(p => (
                  <label key={p.id}
                    className={`pipeline-radio-item${selectedAmoPipeline === p.id ? ' selected' : ''}`}>
                    <input type="radio" name="amo-pipeline" value={p.id}
                      checked={selectedAmoPipeline === p.id}
                      onChange={() => {
                        if (selectedAmoPipeline !== p.id) {
                          setSelectedAmoPipeline(p.id);
                          localStorage.setItem('pipeline_amo', p.id);
                          setSyncResult(null);
                          sessionStorage.removeItem('syncResult');
                          setSavedStageMapping([]);
                        }
                      }} />
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

              <div className="card pipeline-selector-card">
                <h2>📤 Kommo CRM — выберите воронку</h2>
                {pipelines.kommo.length === 0 && <div className="loading">Загрузка...</div>}
                {pipelines.kommo.map(p => (
                  <label key={p.id}
                    className={`pipeline-radio-item${selectedKommoPipeline === p.id ? ' selected' : ''}`}>
                    <input type="radio" name="kommo-pipeline" value={p.id}
                      checked={selectedKommoPipeline === p.id}
                      onChange={() => {
                        if (selectedKommoPipeline !== p.id) {
                          setSelectedKommoPipeline(p.id);
                          localStorage.setItem('pipeline_kommo', p.id);
                          setSyncResult(null);
                          sessionStorage.removeItem('syncResult');
                          setSavedStageMapping([]);
                        }
                      }} />
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

      {/* ═══════════════════════════ МЕНЕДЖЕРЫ ══════════════════════════════ */}
      {tab === 'managers' && (
        <div className="managers-tab">
          <div className="pipeline-selector-grid">
            {/* AMO managers */}
            <div className="card pipeline-selector-card">
              <h2>📥 amo CRM — Менеджеры ОП</h2>
              {!managersLoaded && <div className="loading">Загрузка менеджеров...</div>}
              {amoManagersList.length === 0 && managersLoaded && (
                <div className="no-data">Менеджеры не найдены</div>
              )}
              {amoManagersList.map(m => {
                const alreadyMapped = managerMapping.some(mp => mp.amo_user_id === m.amo_id);
                return (
                  <div key={m.amo_id}
                    className={`pipeline-radio-item${selectedAmoUser?.amo_id === m.amo_id ? ' selected' : ''}${alreadyMapped ? ' mapped-item' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedAmoUser(selectedAmoUser?.amo_id === m.amo_id ? null : m)}>
                    <div className="pipeline-radio-info">
                      <div className="pipeline-radio-name">
                        {m.amo_name}
                        {alreadyMapped && <span className="sync-stage-badge" style={{ marginLeft: 8 }}>✓</span>}
                      </div>
                      <div className="pipeline-radio-meta">{m.amo_email || '—'}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Kommo users */}
            <div className="card pipeline-selector-card">
              <h2>📤 Kommo CRM — Пользователи</h2>
              {!managersLoaded && <div className="loading">Загрузка пользователей...</div>}
              {kommoUsers.length === 0 && managersLoaded && (
                <div className="no-data">Пользователи не найдены</div>
              )}
              {kommoUsers.map(u => {
                const alreadyMapped = managerMapping.some(mp => mp.kommo_user_id === u.id);
                return (
                  <div key={u.id}
                    className={`pipeline-radio-item${selectedKommoUser?.id === u.id ? ' selected' : ''}${alreadyMapped ? ' mapped-item' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedKommoUser(selectedKommoUser?.id === u.id ? null : u)}>
                    <div className="pipeline-radio-info">
                      <div className="pipeline-radio-name">
                        {u.name}
                        {alreadyMapped && <span className="sync-stage-badge" style={{ marginLeft: 8 }}>✓</span>}
                      </div>
                      <div className="pipeline-radio-meta">{u.email || '—'}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Match action */}
          <div className="sync-action-row" style={{ marginTop: 16 }}>
            <button
              className="btn btn-primary btn-sync-big"
              onClick={handleMatchManager}
              disabled={matchLoading || !selectedAmoUser || !selectedKommoUser}>
              {matchLoading ? '⏳ Сохранение...' : '🔗 Сопоставить'}
            </button>
            {selectedAmoUser && selectedKommoUser && (
              <span className="sync-selection-hint">
                {selectedAmoUser.amo_name}
                <span style={{ color: '#64748b', margin: '0 8px' }}>→</span>
                {selectedKommoUser.name}
              </span>
            )}
            {(!selectedAmoUser || !selectedKommoUser) && (
              <span style={{ color: '#94a3b8', fontSize: 13 }}>
                Выберите менеджера слева и пользователя справа
              </span>
            )}
          </div>

          {/* Manager mappings table */}
          {managersLoaded && (
            <div className="card" style={{ marginTop: 16 }}>
              <h2>✅ Сопоставления менеджеров</h2>
              {managerMapping.length === 0 ? (
                <div className="no-data">Сопоставлений пока нет. Выберите менеджера и пользователя выше и нажмите «Сопоставить».</div>
              ) : (
                <div className="stage-mapping-table-wrap">
                  <table className="stage-mapping-table">
                    <thead>
                      <tr>
                        <th className="stage-num">#</th>
                        <th className="stage-cell">amo CRM менеджер</th>
                        <th className="stage-arrow-cell"></th>
                        <th className="stage-cell">Kommo пользователь</th>
                        <th className="stage-status-cell">Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {managerMapping.map((m, i) => (
                        <tr key={m.amo_user_id}
                          className={recentMatch === m.amo_user_id ? 'stage-row-system' : ''}>
                          <td className="stage-num">{i + 1}</td>
                          <td className="stage-cell">
                            <span className="stage-name-text">{m.amo_user_name || m.amo_user_id}</span>
                            <span className="stage-id-badge"> #{m.amo_user_id}</span>
                            {m.amo_email && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{m.amo_email}</div>}
                          </td>
                          <td className="stage-arrow-cell">→</td>
                          <td className="stage-cell">
                            <span className="stage-name-text">{m.kommo_user_name || m.kommo_user_id}</span>
                            <span className="stage-id-badge kommo"> #{m.kommo_user_id}</span>
                            {m.kommo_email && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{m.kommo_email}</div>}
                          </td>
                          <td className="stage-status-cell">
                            ✅
                            <button className="btn btn-danger"
                              style={{ padding: '1px 8px', fontSize: 11, marginLeft: 6 }}
                              onClick={() => handleDeleteMatch(m.amo_user_id)}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="stage-mapping-footnote">
                    <span className="stage-mapping-footnote-text">
                      Итого: {managerMapping.length} {managerMapping.length === 1 ? 'сопоставление' : managerMapping.length < 5 ? 'сопоставления' : 'сопоставлений'}
                    </span>
                    <button className="btn btn-sm stage-mapping-download"
                      onClick={() => downloadManagerMappingCSV(managerMapping)}>
                      ⬇ Скачать (.csv)
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* FieldSync — always mounted, shown/hidden via CSS to keep state */}
      <div style={{ display: tab === 'fields' ? '' : 'none' }}>
        <FieldSync isActive={tab === 'fields'} />
      </div>

      {tab === 'copy' && (
        <CopyDeals />
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
