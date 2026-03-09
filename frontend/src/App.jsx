import { useState, useEffect, useCallback, useRef } from 'react';
import * as api from './api';
import { getCopyTotals, createBackupNow } from './api';
import './App.css';
import FieldSync from './FieldSync';
import CopyDeals from './CopyDeals';

// APP_VERSION is fetched from /api/version — see appVersion state below

const STATUS_LABELS = {
  idle: 'Ожидание',
  running: 'Выполняется',
  completed: 'Завершено',
  error: 'Ошибка',
  rolling_back: 'Откат...',
  paused: 'На паузе',
};

const STATUS_COLORS = {
  idle: '#6b7280',
  running: '#3b82f6',
  completed: '#10b981',
  error: '#ef4444',
  rolling_back: '#f59e0b',
  paused: '#f59e0b',
};

const MIGRATION_PLAN = [
  { step: 1, title: '⚠️ Синхронизация этапов воронки (разово)', desc: 'Вкладка «Воронки» → выберите воронку в amo CRM и воронку в Kommo → «Синхронизировать этапы». Делается один раз. Без этого сделки попадут в неправильные этапы.' },
  { step: 2, title: '⚠️ Сопоставление менеджеров (разово, обязательно!)', desc: 'Вкладка «Менеджеры» → для каждого менеджера amo CRM выберите соответствующего в Kommo → «Сопоставить». Без этого шага все сделки окажутся без ответственного менеджера.' },
  { step: 3, title: 'Синхронизация кастомных полей (разово)', desc: 'Вкладка «Поля» → «Загрузить анализ» → выберите поля со статусом «Нет в Kommo» → «Создать выбранные». Без полей данные сделок будут неполными.' },
  { step: 4, title: 'Загрузка данных из amo CRM', desc: 'Дашборд → «⬇️ Загрузить данные». Загружает сделки, контакты, компании, задачи в локальный кэш. Серые числа (📥) = количество загруженных записей. Повторная загрузка обновляет кэш.' },
  { step: 5, title: 'Пакетный перенос', desc: 'Выберите размер пакета (1 / 10 / 25 / 50 / 100 / 200 / ВСЕ) → «▶️ Перенести». Порядок внутри пакета: компании → контакты → сделки → задачи → комментарии. Зелёные числа (✅) растут по мере переноса. Следующий нажим «Перенести» продолжит с того места, где остановились.' },
  { step: 6, title: 'Тонкий перенос (только нужные)', desc: 'Нажмите «🔍 Только необработанные» — из кэша уберутся уже перенесённые сделки, офсет сбросится. Затем «🔁 Сбросить счётчик» → выберите нужный размер пакета → «Перенести». Дублей не будет — система помнит все перенесённые ID.' },
  { step: 7, title: 'Резервные копии', desc: 'Создаются автоматически перед каждым переносом (вкладка «Бэкапы»). Исходные данные в amo CRM НЕ удаляются — только после вашей ручной проверки.' },
];

export default function App() {
  const [status, setStatus] = useState(null);
  const [appVersion, setAppVersion] = useState('V1.5.48'); // auto-updated
  const [versionHistory, setVersionHistory] = useState([]);
  const [pipelines, setPipelines] = useState({ amo: [], kommo: [] });
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState('dashboard');
  const [helpOpen, setHelpOpen] = useState(false);
  // Auto-fetch backend version once on mount
  useEffect(() => {
    fetch('/api/version')
      .then(r => r.json())
      .then(d => { if (d.version) setAppVersion(d.version); })
      .catch(() => {});
    fetch('/api/version/changelog')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setVersionHistory(d); })
      .catch(() => {});
  }, []);

  // Fetch copy totals from DB on mount and expose refresh function
  const refreshCopyTotals = async () => {
    try { setCopyTotals(await getCopyTotals()); } catch(e) {}
  };
  useEffect(() => { refreshCopyTotals(); }, []);



  // AMO data fetch state (dashboard)
  const [fetchSt, setFetchSt] = useState(null);
  // Счётчик обновлений кэша — передаётся в FieldSync для авто-перезагрузки полей
  const [cacheRefreshKey, setCacheRefreshKey] = useState(0);
  const prevFetchStatus = useRef(null);

  // Batch migration state
  const [batchStats, setBatchStats] = useState(null);
  const [batchStatus, setBatchStatusData] = useState(null);
  const [selectedManagers, setSelectedManagers] = useState([]);
  const [batchSize, setBatchSize] = useState(10);
  const [batchLoading, setBatchLoading] = useState(false);
  // Crash detection: if server restarts while running, status goes idle without completing
  const prevBatchStatusRef = useRef(null);
  const [crashDetected, setCrashDetected] = useState(false);

  // Single deals transfer state
  const [dealsList, setDealsList] = useState([]);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [selectedDealIds, setSelectedDealIds] = useState(new Set());
  const [singleTransferLoading, setSingleTransferLoading] = useState(false);
  const [singleTransferResult, setSingleTransferResult] = useState(null);
  const [dealsManagersMap, setDealsManagersMap] = useState({});
  const [dealsSearch, setDealsSearch] = useState('');
  // Migrated deal IDs — persisted in localStorage for green highlight
  const [migratedDealIds, setMigratedDealIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('migrated_deal_ids') || '[]')); }
    catch { return new Set(); }
  });
  // Copy totals from DB — real accumulated counts
  const [copyTotals, setCopyTotals] = useState(null);

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
      const s = localStorage.getItem('syncResult');
      if (!s) return null;
      const parsed = JSON.parse(s);
      // Remove _pipeline metadata key (object value causes React crash when rendered as JSX child)
      if (parsed?.stageMapping) delete parsed.stageMapping._pipeline;
      return parsed;
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
    // Initial batch status load — gets cacheStats + migrationTotals from files
    api.getBatchStatus().then(d => { if (d) setBatchStatusData(d); }).catch(() => {});
    api.getBatchStats().then(setBatchStats).catch(() => {});

    // Auto-load manager mapping and user lists on mount (persist across reloads)
    api.getManagerMapping().then(res => {
      const mappings = res.mappings || [];
      setManagerMapping(mappings);
    }).catch(() => {});
    Promise.all([
      api.getAmoManagers().catch(() => ({ managers: [] })),
      api.getKommoUsers().catch(() => ({ users: [] })),
    ]).then(([amoRes, kommoRes]) => {
      setAmoManagersList(amoRes.managers || []);
      setKommoUsers(kommoRes.users || []);
      setManagersLoaded(true);
    }).catch(() => {});
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
    if (selectedAmoPipeline && selectedKommoPipeline) {
      loadSavedStageMapping(selectedAmoPipeline, selectedKommoPipeline);
    }
  }, [selectedAmoPipeline, selectedKommoPipeline]);

  // Build paired rows from syncResult stageMapping
  const buildStagePairs = (syncRes, amoSt, kommoSt) => {
    if (!syncRes?.stageMapping) return [];
    return Object.entries(syncRes.stageMapping)
      .filter(([k]) => k !== '_pipeline') // skip backend metadata key — its object value crashes React render
      .map(([amoIdStr, kommoId]) => {
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

  // При завершении загрузки кэша — уведомляем FieldSync о необходимости перезагрузить маппинг
  useEffect(() => {
    const prev = prevFetchStatus.current;
    prevFetchStatus.current = fetchSt?.status;
    if (prev === 'loading' && fetchSt?.status === 'done') {
      setCacheRefreshKey(k => k + 1);
      // Refresh batchStatus to update cacheStats (new cache file was just written)
      api.getBatchStatus().then(d => { if (d) setBatchStatusData(d); }).catch(() => {});
      api.getBatchStats().then(setBatchStats).catch(() => {});
    }
  }, [fetchSt?.status]);

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

  // Poll batch status + client-side countdown
  useEffect(() => {
    const st = batchStatus?.status;
    if (st !== 'running' && st !== 'rolling_back' && st !== 'auto-waiting') return;

    // Client-side countdown: smooth 1s decrement (no network dependency)
    let countdownTimer = null;
    if (st === 'auto-waiting') {
      countdownTimer = setInterval(() => {
        setBatchStatusData(prev => {
          if (!prev || prev.status !== 'auto-waiting' || !prev.autoRunCountdown || prev.autoRunCountdown <= 0) return prev;
          return { ...prev, autoRunCountdown: prev.autoRunCountdown - 1 };
        });
      }, 1000);
    }

    // Server poll every 2s: sync real state + counters
    let polling = true;
    const poll = async () => {
      while (polling) {
        try {
          const d = await api.getBatchStatus();
          if (!polling) break;
          if (prevBatchStatusRef.current === 'running' && d.status === 'idle') {
            setCrashDetected(true);
          }
          prevBatchStatusRef.current = d.status;
          // Sync counters instantly from embedded stats
          if (d.stats) {
            setBatchStats(prev => ({
              ...(prev || {}),
              ...d.stats,
              alreadyMigrated: d.stats.totalTransferred,
            }));
          }
          setBatchStatusData(d);
          // Terminal states: fetch full stats and stop polling
          if (d.status !== 'running' && d.status !== 'rolling_back' && d.status !== 'auto-waiting') {
            api.getBatchStats().then(setBatchStats).catch(() => {});
            break;
          }
        } catch {}
        // Wait 2s between polls
        await new Promise(r => setTimeout(r, 2000));
      }
    };
    poll();

    return () => { polling = false; if (countdownTimer) clearInterval(countdownTimer); };
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
      // Remove _pipeline metadata key — its object value crashes React render if passed as JSX child
      if (result?.stageMapping) delete result.stageMapping._pipeline;
      setSyncResult(result);
      try { localStorage.setItem('syncResult', JSON.stringify(result)); } catch {}
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
          // Refresh pipelines list so kommoSt cache reflects any Kommo changes
          fetchPipelines().catch(() => {});
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
    // Менеджеры определяются из managerMapping (вкладка "Менеджеры")
    let mapping = managerMapping;
    if (mapping.length === 0) {
      try {
        const res = await api.getManagerMapping();
        mapping = res.mappings || [];
        if (mapping.length > 0) setManagerMapping(mapping);
      } catch {}
    }
    const hasMappedManagers = mapping.length > 0;
    if (!hasMappedManagers) {
      if (!confirm('Сопоставление менеджеров не настроено — перенести сделки без привязки к менеджерам?')) return;
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

  const handleResumeBatch = async () => {
    if (!confirm(`Продолжить перенос? Будет использован offset: ${batchStatus?.progress?.current ?? 0} сделок.`)) return;
    setBatchLoading(true);
    setMessage('');
    try {
      await api.setBatchConfig({ managerIds: selectedManagers, batchSize });
      await api.startBatch();
      setMessage('▶ Продолжение миграции запущено...');
      setTimeout(async () => {
        const d = await api.getBatchStatus().catch(() => null);
        if (d) setBatchStatusData(d);
      }, 800);
    } catch (e) {
      setMessage(`❌ Ошибка: ${e.response?.data?.error || e.message}`);
    }
    setBatchLoading(false);
  };

  const handleBatchPause = async () => {
    try {
      await api.pauseBatch();
      setMessage('⏸ Запрос паузы отправлен. Миграция остановится на ближайшей точке.');
      setTimeout(async () => {
        const [d, s] = await Promise.all([api.getBatchStatus(), api.getBatchStats()]).catch(() => [null, null]);
        if (d) setBatchStatusData(d);
        if (s) setBatchStats(s);
      }, 1500);
    } catch (e) {
      setMessage('❌ ' + (e.response?.data?.error || e.message));
    }
  };

  const handleStartAutoRun = async () => {
    if (batchSize === 0 || !batchSize) {
      setMessage('❌ Выберите размер пакета (1–200) перед запуском автозапуска');
      return;
    }
    if (!confirm(`Запустить автозапуск? Пакеты по ${batchSize} сделок будут переноситься автоматически с паузой 60 сек между ними. Нажмите «⏹ Стоп» для остановки.`)) return;
    setBatchLoading(true);
    setMessage('');
    try {
      await api.setBatchConfig({ managerIds: selectedManagers, batchSize });
      await api.startAutoRun();
      setMessage('🔄 Автозапуск активирован — пакеты по ' + batchSize + ' сделок будут переноситься автоматически');
      setTimeout(async () => {
        const d = await api.getBatchStatus().catch(() => null);
        if (d) setBatchStatusData(d);
      }, 800);
    } catch (e) {
      setMessage(`❌ Ошибка: ${e.response?.data?.error || e.message}`);
    }
    setBatchLoading(false);
  };

  const handleStopAutoRun = async () => {
    try {
      const result = await api.stopAutoRun();
      const t = result.transferred || 0;
      const r = result.remaining || 0;
      const msg = result.wasRunning
        ? '⏹ Стоп принят. Текущий пакет завершится.\n📊 Перенесено: ' + t + '. Осталось: ' + r + '.\n▶ Продолжить: «Авто ВСЕ» или «Перенести».'
        : '⏹ Автозапуск остановлен.\n📊 Перенесено: ' + t + '. Осталось: ' + r + '.\n▶ Продолжить: «Авто ВСЕ» или «Перенести».';
      setMessage(msg);
      // Immediate state refresh
      const [d, s] = await Promise.all([api.getBatchStatus(), api.getBatchStats()]).catch(() => [null, null]);
      if (d) setBatchStatusData(d);
      if (s) setBatchStats(s);
    } catch (e) {
      setMessage('❌ ' + (e.response?.data?.error || e.message));
      const [d, s] = await Promise.all([api.getBatchStatus(), api.getBatchStats()]).catch(() => [null, null]);
      if (d) setBatchStatusData(d);
      if (s) setBatchStats(s);
    }
  };

  const handleBatchReset = async () => {
    if (!confirm('Сбросить счётчик? Следующий пакет начнётся с первой сделки. Зелёный счётчик «Перенесено» обнулится и будет считать с нуля.')) return;
    try {
      await api.resetBatchOffset();
      // Clear green highlights for migrated deals
      localStorage.removeItem('migrated_deal_ids');
      setMigratedDealIds(new Set());
      const [d, stats] = await Promise.all([
        api.getBatchStatus().catch(() => null),
        api.getBatchStats().catch(() => null),
      ]);
      if (d) setBatchStatusData(d);
      if (stats) setBatchStats(stats);
      setMessage('✅ Счётчик сброшен — зелёные числа обнулены');
    } catch (e) {
      setMessage(`❌ ${e.response?.data?.error || e.message}`);
    }
  };

  const handleFilterCacheUnprocessed = async () => {
    if (!confirm('Оставить в кэше только необработанные сделки? Уже перенесённые будут исключены. Офсет будет сброшен в 0. Действие необратимо до следующей загрузки AMO.')) return;
    try {
      const r = await api.filterCacheUnprocessed();
      setMessage(`✅ Готово: ${r.after.leads} необработанных сделок (было ${r.before.leads}, убрано ${r.removed}). Офсет сброшен. Нажмите «🔁 Сбросить счётчик» чтобы обнулить зелёные числа.`);
      const [d, stats] = await Promise.all([
        api.getBatchStatus().catch(() => null),
        api.getBatchStats().catch(() => null),
      ]);
      if (d) setBatchStatusData(d);
      if (stats) setBatchStats(stats);
    } catch (e) {
      setMessage('❌ ' + (e.response?.data?.error || e.message));
    }
  };

  const handleRetryBatch = async () => {
    if (!confirm('Повторить последний пакет? Уже перенесённые данные не будут дублироваться, но пропущенные заметки/задачи будут повторно отправлены.')) return;
    setBatchLoading(true);
    setMessage('');
    try {
      await api.retryBatch();
      setMessage('🔄 Повтор последнего пакета запущен...');
      setTimeout(async () => {
        const d = await api.getBatchStatus().catch(() => null);
        if (d) setBatchStatusData(d);
      }, 800);
    } catch (e) {
      setMessage('❌ ' + (e.response?.data?.error || e.message));
    }
    setBatchLoading(false);
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
      case 'versions':  return '📋 Версии';
      default: return t;
    }
  };

  return (
    <div className="app">
      <div style={{ position: 'fixed', top: 8, left: 8, zIndex: 9999, background: 'rgba(30,30,40,0.85)', color: '#fff', fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 6, letterSpacing: '0.05em', pointerEvents: 'none', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.15)' }}>{appVersion}</div>
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

              {/* ── INTRO ─────────────────────────────────────────── */}
              <div className="plan-intro">
                Перенос данных из <strong>amo CRM</strong> в <strong>Kommo CRM</strong>.
                Исходные данные в amo CRM <strong>не удаляются</strong> — только после вашей ручной проверки.
              </div>

              {/* ── РАЗОВАЯ НАСТРОЙКА ─────────────────────────────── */}
              <div className="plan-guide-block warn">
                <h3>🔑 Разовая настройка (только при первом запуске)</h3>
                <ol>
                  <li>
                    <strong>Вкладка «Воронки»</strong> → выберите воронку в amo CRM и воронку в Kommo → нажмите
                    «Синхронизировать этапы». Система создаст в Kommo все этапы из выбранной воронки amo.
                  </li>
                  <li>
                    <strong>Вкладка «Менеджеры»</strong> ⚠️ <em>Обязательно!</em> → для каждого менеджера amo CRM
                    выберите соответствующего в Kommo → «Сопоставить».
                    Без этого шага все сделки окажутся без ответственного менеджера.
                  </li>
                  <li>
                    <strong>Вкладка «Поля»</strong> → «Загрузить анализ» → отметьте поля со статусом
                    «Нет в Kommo» → «Создать выбранные». Без полей данные сделок будут неполными.
                  </li>
                </ol>
              </div>

              {/* ── ПАКЕТНЫЙ ПЕРЕНОС ──────────────────────────────── */}
              <div className="plan-guide-block green">
                <h3>📦 Пакетный перенос (основной способ)</h3>
                <ol>
                  <li>
                    <strong>«⬇️ Загрузить данные»</strong> — заполняет локальный кэш.
                    <br/><em>Серые числа 📥 = количество в кэше. Повторная загрузка обновляет кэш новыми сделками.</em>
                  </li>
                  <li>
                    <strong>Выберите размер пакета:</strong> 1 / 10 / 25 / 50 / 100 / 200 / ВСЕ.
                    Рекомендуется начинать с 10–50 для первой проверки.
                  </li>
                  <li>
                    <strong>«▶️ Перенести»</strong> — запустить. Порядок внутри пакета:
                    компании → контакты → сделки → задачи → комментарии.
                    <br/><em>Зелёные числа ✅ растут по мере переноса.</em>
                  </li>
                  <li>
                    <strong>Следующая сессия</strong> — просто снова нажать «▶️ Перенести».
                    Система продолжит с того места где остановилась (офсет сохранён).
                  </li>
                </ol>
              </div>

              {/* ── ТОНКИЙ ПЕРЕНОС ────────────────────────────────── */}
              <div className="plan-guide-block">
                <h3>🎯 Тонкий перенос (только выбранные / только новые)</h3>
                <ol>
                  <li>Нажмите <strong>«🔍 Только необработанные»</strong> — из кэша исключатся уже перенесённые, офсет сбросится в 0.</li>
                  <li>Нажмите <strong>«🔁 Сбросить счётчик»</strong> — зелёные числа обнулятся.</li>
                  <li>Выберите нужный размер пакета → <strong>«▶️ Перенести»</strong>.</li>
                </ol>
                <p style={{color:'#64748b',fontSize:'13px',marginTop:'6px'}}>
                  ✓ Дублей не будет — система хранит все перенесённые ID в migration_index.json
                </p>
              </div>

              {/* ── СЧЁТЧИКИ ──────────────────────────────────────── */}
              <div className="plan-section">
                <h3>📊 Счётчики и кнопки управления</h3>
                <table className="plan-table">
                  <thead>
                    <tr>
                      <th>Элемент</th>
                      <th>Что означает / делает</th>
                      <th>Когда использовать</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>Серые числа 📥</td><td>Загружено из amo (всего в кэше)</td><td>Контроль загрузки</td></tr>
                    <tr><td>Зелёные числа ✅</td><td>Перенесено в Kommo (с последнего сброса)</td><td>Контроль переноса</td></tr>
                    <tr><td>«▶️ Перенести»</td><td>Продолжить с текущего офсета</td><td>Каждая сессия</td></tr>
                    <tr><td>«🔁 Сбросить счётчик»</td><td>Обнулить зелёные числа, начать очередь сначала</td><td>Перед новой сессией</td></tr>
                    <tr><td>«🔍 Только необработанные»</td><td>Убрать перенесённые из кэша + сбросить офсет</td><td>Когда кэш «засорён»</td></tr>
                    <tr><td>«⏸ Пауза»</td><td>Остановить после текущей сделки</td><td>Нужно прервать</td></tr>
                  </tbody>
                </table>
                <p style={{fontSize:'13px',color:'#64748b',marginTop:'8px'}}>
                  Расхождение серого и зелёного — норма, если перенос ещё не завершён.
                </p>
              </div>

              {/* ── СБОИ ──────────────────────────────────────────── */}
              <div className="plan-guide-block red">
                <h3>🆘 Что делать при сбоях</h3>
                <ul>
                  <li><strong>Завис / ошибка API / таймаут</strong> — нажмите «▶️ Перенести» снова. Продолжит с точки остановки. Дублей не будет.</li>
                  <li><strong>Баннер «CRASH DETECTED»</strong> — нажмите «▶ Продолжить» для возобновления.</li>
                  <li><strong>Перенесены лишние или неверные сделки</strong> — «↩ Откатить пакет» удалит последний пакет из Kommo. Можно откатывать несколько раз подряд.</li>
                  <li><strong>Полный откат</strong> — кнопка «Откатить всё» удалит все перенесённые данные из Kommo (кроме настроек воронки и полей).</li>
                  <li><strong>Зелёное число меньше ожидаемого</strong> — нажмите «🔍 Только необработанные» и запустите пакет повторно.</li>
                  <li><strong>Счётчик застыл</strong> — «⏸ Пауза» → подождать → «▶️ Перенести» снова.</li>
                </ul>
              </div>

              {/* ── ПРОВЕРКА ПОСЛЕ ────────────────────────────────── */}
              <div className="plan-section">
                <h3>✅ Проверка после переноса</h3>
                <ol>
                  <li>Зелёные счётчики (Сделки / Контакты / Компании / Задачи) соответствуют ожиданиям</li>
                  <li>В воронке Kommo — сделки с правильными этапами и менеджерами</li>
                  <li>Открыть несколько карточек — проверить кастомные поля, задачи и комментарии в таймлайне</li>
                  <li>Данные в amo CRM <strong>удалить вручную</strong> только после полной проверки</li>
                </ol>
              </div>

              <hr className="plan-divider" />

              {/* ── ШПАРГАЛКА ─────────────────────────────────────── */}
              <div className="plan-cheatsheet">
                <div style={{color:'#f59e0b',marginBottom:'4px',fontWeight:600}}>⚡ Шпаргалка</div>
                <div><span style={{color:'#f59e0b'}}>Первый раз:</span> <span style={{color:'#e2e8f0'}}>Воронки → Менеджеры ✅ → Поля ✅</span></div>
                <div><span style={{color:'#10b981'}}>Каждая сессия:</span> <span style={{color:'#e2e8f0'}}>Загрузить данные → выбрать размер → Перенести ▶️</span></div>
                <div><span style={{color:'#60a5fa'}}>Продолжить прошлую:</span> <span style={{color:'#e2e8f0'}}>просто нажать «Перенести» (офсет сохранён)</span></div>
                <div><span style={{color:'#a78bfa'}}>Только новые сделки:</span> <span style={{color:'#e2e8f0'}}>«🔍 Только необработанные» → «🔁 Сбросить» → «Перенести»</span></div>
                <div><span style={{color:'#f87171'}}>Что-то не так:</span> <span style={{color:'#e2e8f0'}}>нажать «Перенести» снова — продолжит без дублей</span></div>
              </div>

              <hr className="plan-divider" />

              {/* ── СПРАВОЧНИК ШАГОВ (кратко) ─────────────────────── */}
              <div style={{color:'#64748b',fontSize:'13px',textTransform:'uppercase',letterSpacing:'0.05em',fontWeight:600}}>
                Справочник шагов
              </div>
              <ol className="plan-steps">
                {MIGRATION_PLAN.map(({ step, title, desc }) => (
                  <li key={step} className="plan-step">
                    <div className="plan-step-title">Шаг {step}: {title}</div>
                    <div className="plan-step-desc">{desc}</div>
                  </li>
                ))}
              </ol>

            </div>
          </div>
        </div>
      )}

      <nav className="tabs">
        {['dashboard', 'pipelines', 'managers', 'fields', 'backups', 'versions'].map(t => (
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
                leadTasks: 'Задачи (сделки)', contactTasks: 'Задачи (контакты)', companyTasks: 'Задачи (компании)',
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

            {/* ── ЗАГРУЖЕНО / ПЕРЕНЕСЕНО combined ── */}
            {batchStatus?.cacheStats && (
              <div style={{ marginTop: 12, marginBottom: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <span>📥 Загружено из AMO / ✅ Перенесено в Kommo</span>
                  {batchStatus?.cacheStats?.fetchedAt && (
                    <span style={{ fontWeight: 400, fontSize: 11, color: '#94a3b8' }}>
                      {new Date(batchStatus.cacheStats.fetchedAt).toLocaleString('ru-RU')}
                    </span>
                  )}
                  {batchStatus?.batchPosition?.offset > 0 && (
                    <span style={{ fontWeight: 400, fontSize: 11, color: '#64748b' }}>
                      · пакеты: {batchStatus.batchPosition.offset} из {batchStatus.cacheStats?.leads ?? '?'}
                    </span>
                  )}
                </div>
                <div className="counters">
                  {[
                    { label: 'Сделки',                 key: 'leads',        icon: '📋' },
                    { label: 'Контакты',               key: 'contacts',     icon: '👤' },
                    { label: 'Компании',               key: 'companies',    icon: '🏢' },
                    { label: 'Задачи (сделки)',        key: 'leadTasks',    icon: '✅' },
                    { label: 'Задачи (контакты)',      key: 'contactTasks', icon: '✅' },
                    { label: 'Задачи (компании)',      key: 'companyTasks', icon: '✅' },
                    { label: 'Комм. (сделки)',         key: 'leadNotes',    icon: '💬' },
                    { label: 'Комм. (контакты)',       key: 'contactNotes', icon: '💬' },
                  ].map(({ label, key, icon }) => {
                    const _cache = batchStatus?.cacheStats?.[key] ?? 0;
                    const _migrated = batchStatus?.migrationTotals?.[key] ?? 0;
                    const _pending = batchStatus?.pendingStats?.[key] ?? 0;
                    const _prior = Math.max(0, _cache - _migrated - _pending);
                    return (
                    <div className="counter" key={key}>
                      <div className="counter-icon">{icon}</div>
                      <div className="counter-value" style={{ fontSize: 22, lineHeight: 1.1 }}>
                        {batchStatus?.cacheStats?.[key] ?? '—'}
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#f59e0b', marginTop: 2, lineHeight: 1.1 }} title="Новых (ожидают переноса)">
                        ⏳ {batchStatus?.pendingStats?.[key] ?? '—'}
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#10b981', marginTop: 2, lineHeight: 1.1 }} title="Перенесено в этой сессии">
                        ✅ {batchStatus?.migrationTotals?.[key] ?? 0}
                      </div>
                      {_prior > 0 && (
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#a78bfa', marginTop: 1, lineHeight: 1.1 }} title="Перенесено ранее (до текущей сессии, общие для нескольких воронок)">
                          ↩ {_prior} ранее
                        </div>
                      )}
                      <div className="counter-label" style={{ color: '#ffffff' }}>{label}</div>
                    </div>
                    );
                  })}
                </div>
                {/* ── Info: dedup explanation when prior counts exist ── */}
                {(() => {
                  const _keys = ['contacts', 'companies', 'contactNotes'];
                  const _priors = {};
                  let _anyPrior = false;
                  _keys.forEach(k => {
                    const c = batchStatus?.cacheStats?.[k] ?? 0;
                    const m = batchStatus?.migrationTotals?.[k] ?? 0;
                    const p = batchStatus?.pendingStats?.[k] ?? 0;
                    const v = Math.max(0, c - m - p);
                    if (v > 0) { _priors[k] = v; _anyPrior = true; }
                  });
                  if (!_anyPrior) return null;
                  return (
                    <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 8, fontSize: 12, color: '#c4b5fd', lineHeight: 1.5 }}>
                      <strong>ℹ️ Расхождение счётчиков:</strong>{' '}
                      {_priors.contacts && <span>Контактов: <b>{_priors.contacts}</b> уже перенесены ранее (общие для нескольких воронок). </span>}
                      {_priors.companies && <span>Компаний: <b>{_priors.companies}</b> перенесены ранее. </span>}
                      {_priors.contactNotes && <span>Комм. контактов: <b>{_priors.contactNotes}</b> перенесены ранее. </span>}
                      <span style={{ color: '#94a3b8' }}>Эти элементы пропускаются при переносе (дубли запрещены), но привязки к сделкам сохраняются корректно.</span>
                    </div>
                  );
                })()}
                <div style={{ fontSize: 11, color: '#475569', marginTop: 6, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <span style={{ color: '#94a3b8' }}>Серое — всего загружено из AMO</span>
                  <span style={{ color: '#f59e0b' }}>⏳ жёлтое — новых (ожидают переноса)</span>
                  <span style={{ color: '#10b981' }}>✅ зелёное — перенесено в этой сессии</span>
                  <span style={{ color: '#a78bfa' }}>↩ фиолетовое — перенесено ранее (до сессии)</span>
                </div>
              </div>
            )}

            {/* Stats row: available / transferred (leads only, for batch control) */}
            {batchStats && (
              <div className="batch-stats" style={{ marginTop: 10 }}>
                <div className="batch-stat eligible">
                  <div className="batch-stat-val">{batchStats.totalEligible ?? '—'}</div>
                  <div className="batch-stat-lbl">Доступно для переноса</div>
                </div>
                <div className="batch-stat transferred">
                  <div className="batch-stat-val">{batchStats.alreadyMigrated ?? batchStats.totalTransferred ?? 0}</div>
                  <div className="batch-stat-lbl">Перенесено всего</div>
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
                {[1, 10, 25, 50, 100, 200].map(sz => (
                  <button key={sz}
                    className={`batch-size-btn${batchSize === sz ? ' active' : ''}`}
                    onClick={() => handleBatchSizeChange(sz)}
                    disabled={batchStatus?.status === 'running'}>
                    {sz}
                  </button>
                ))}
              </div>
              <button className="btn btn-primary" onClick={handleStartBatch}
                disabled={batchLoading || batchStatus?.status === 'running' || batchStatus?.status === 'auto-waiting' || batchStatus?.autoRunActive || batchStats?.remainingLeads === 0}>
                {batchStatus?.status === 'running'
                  ? `⏳ ${batchStatus.step || 'Выполняется...'}`
                  : batchStatus?.status === 'auto-waiting'
                    ? `⏳ Пауза ${batchStatus.autoRunCountdown || ''}с...`
                    : `🚀 Перенести ${batchSize || 10} сделок`}
              </button>
              <button className="btn btn-primary" onClick={handleStartAutoRun}
                disabled={batchLoading || batchStatus?.status === 'running' || batchStatus?.status === 'auto-waiting' || batchStatus?.autoRunActive || batchStats?.remainingLeads === 0}
                title="Автоматически переносить пакеты один за другим с паузой 60 сек между ними"
                style={{ background: 'rgba(16,185,129,0.25)', borderColor: 'rgba(16,185,129,0.6)', color: '#6ee7b7' }}>
                🔄 Авто ВСЕ
              </button>
              {(batchStatus?.status === 'running' && !batchStatus?.autoRunActive) && (
                <button className="btn btn-warn" onClick={handleBatchPause}
                  disabled={batchLoading}
                  title="Остановить на ближайшей контрольной точке">
                  ⏸ Пауза
                </button>
              )}
              {(batchStatus?.autoRunActive || batchStatus?.status === 'auto-waiting') && (
                <button className="btn btn-warn" onClick={handleStopAutoRun}
                  title="Остановить автозапуск (текущий пакет завершится)"
                  style={{ background: 'rgba(239,68,68,0.3)', borderColor: 'rgba(239,68,68,0.7)', color: '#fca5a5' }}>
                  ⏹ Стоп
                </button>
              )}
              {(batchStatus?.status === 'error' || batchStatus?.status === 'paused' || crashDetected) && (
                <button className="btn btn-primary" onClick={handleResumeBatch}
                  disabled={batchLoading}
                  title="Продолжить с последнего успешного места">
                  ▶ Продолжить пакет
                </button>
              )}
              <button className="btn btn-secondary" onClick={handleBatchReset}
                disabled={batchLoading || batchStatus?.status === 'running'}>
                🔁 Сбросить счётчик
              </button>
              <button className="btn btn-secondary" onClick={handleFilterCacheUnprocessed}
                disabled={batchLoading || batchStatus?.status === 'running'}
                title="Убрать из кэша уже перенесённые сделки — останутся только необработанные"
                style={{ background: 'rgba(234,179,8,0.15)', borderColor: 'rgba(234,179,8,0.5)', color: '#fcd34d' }}>
                🔍 Только необработанные
              </button>
              <button className="btn btn-secondary" onClick={handleRetryBatch}
                disabled={batchLoading || batchStatus?.status === 'running' || !batchStatus?.lastBatch}
                title="Повторить последний пакет — пропущенные заметки/задачи будут перенесены повторно"
                style={{ background: 'rgba(168,85,247,0.15)', borderColor: 'rgba(168,85,247,0.5)', color: '#c4b5fd' }}>
                🔄 Повтор пакета
              </button>
            </div>

            {/* Auto-run countdown banner */}
            {batchStatus?.status === 'auto-waiting' && (
              <div style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.45)', borderRadius: 8, padding: '10px 14px', marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>🔄</span>
                <span style={{ fontSize: 13, color: '#6ee7b7' }}>
                  Автозапуск: пауза {batchStatus.autoRunCountdown || '...'} сек до следующего пакета. Нажмите «⏹ Стоп» чтобы остановить.
                </span>
              </div>
            )}

            {/* Auto-stopped banner */}
            {batchStatus?.status === 'auto-stopped' && (
              <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 8, padding: '10px 14px', marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>⚠️</span>
                <span style={{ fontSize: 13, color: '#fca5a5' }}>
                  {batchStatus.step || 'Автозапуск остановлен из-за расхождения счётчиков. Проверьте данные.'}
                </span>
              </div>
            )}

            {/* Time estimate */}
            {batchStatus?.status !== 'running' && batchStatus?.status !== 'auto-waiting' && batchSize > 0 && (
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6, marginBottom: 2 }}>
                ⏱ Прогноз: ~{Math.max(1, Math.round(batchSize * 1.5 * 1.3 / 60))} мин для {batchSize} сделок
                {batchStats?.remainingLeads > 0 && ` · Осталось: ${batchStats.remainingLeads}`}
              </div>
            )}

            {/* Interrupted banner */}
            {(batchStatus?.status === 'error' || batchStatus?.status === 'paused') && (
              <div style={{ background: batchStatus?.status === 'paused' ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)', border: '1px solid ' + (batchStatus?.status === 'paused' ? 'rgba(245,158,11,0.45)' : 'rgba(239,68,68,0.35)'), borderRadius: 8, padding: '8px 14px', marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, color: batchStatus?.status === 'paused' ? '#fcd34d' : '#fca5a5' }}>
                  {batchStatus?.status === 'paused' ? '⏸ Перенос на паузе.' : '⛔ Перенос прерван.'}{batchStatus.progress?.current > 0 ? ` Обработано: ${batchStatus.progress.current} сделок.` : ''} Нажмите «▶ Продолжить пакет».
                </span>
              </div>
            )}

            {/* Crash recovery banner — server restarted during migration */}
            {crashDetected && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.45)', borderRadius: 8, padding: '10px 14px', marginTop: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#f87171', marginBottom: 4 }}>
                  ⚡ Сервер перезагрузился в процессе переноса
                </div>
                <div style={{ fontSize: 12, color: '#fca5a5', lineHeight: 1.5 }}>
                  Частично перенесённые данные <b>не потеряны</b> — они зарегистрированы в индексе безопасности.<br/>
                  Счётчик «Перенесено в Kommo» показывает актуальные данные из индекса.<br/>
                  Нажмите «▶ Продолжить пакет» — уже созданные объекты будут пропущены автоматически.
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
                  <button onClick={handleResumeBatch} disabled={batchLoading}
                    style={{ padding: '7px 18px', background: '#3b82f6', border: 'none', color: '#fff', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                    ▶ Продолжить пакет
                  </button>
                  <button onClick={() => setCrashDetected(false)}
                    style={{ padding: '6px 14px', background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                    Понятно, не продолжать
                  </button>
                </div>
              </div>
            )}

            {/* Completion stats */}
            {batchStatus?.status === 'completed' && batchStatus?.createdIds && (
              <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, padding: '10px 14px', marginTop: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#86efac', marginBottom: 6 }}>✅ Пакет завершён</div>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12, color: '#cbd5e1' }}>
                  <span>Сделок: <b style={{color:'#fff'}}>{batchStatus.createdIds.leads?.length ?? 0}</b></span>
                  <span>Контактов: <b style={{color:'#fff'}}>{batchStatus.createdIds.contacts?.length ?? 0}</b></span>
                  <span>Компаний: <b style={{color:'#fff'}}>{batchStatus.createdIds.companies?.length ?? 0}</b></span>
                  <span>Задач: <b style={{color:'#fff'}}>{batchStatus.createdIds.tasks?.length ?? 0}</b></span>
                  <span>Заметок: <b style={{color:'#fff'}}>{batchStatus.createdIds.notes?.length ?? 0}</b></span>
                  <span>⚠️ предупреждений: <b style={{color: batchStatus.warnings?.length > 0 ? '#fbbf24':'#fff'}}>{batchStatus.warnings?.length ?? 0}</b></span>
                  <span>❌ ошибок: <b style={{color: batchStatus.errors?.length > 0 ? '#f87171':'#fff'}}>{batchStatus.errors?.length ?? 0}</b></span>
                </div>
              </div>
            )}

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
                    {w.details?.length > 0 && (
                      <details className="warning-details">
                        <summary>Подробности ({w.details.length})</summary>
                        <div className="warning-details-list">
                          {w.details.map((d, j) => <div key={j} className="warning-details-row">{d}</div>)}
                        </div>
                      </details>
                    )}
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

          {/* ДЛЯ ПЕРЕНОСА card removed — data shown inside batch card above */}

          {/* ПЕРЕНЕСЕНО card removed — merged into batch card above */}

          {/* Controls hidden */}
          <div className="card controls-card" style={{ display: 'none' }}>
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
          <div className="card rollback-card" style={{ display: 'none' }}>
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
                          background: migratedDealIds.has(d.id)
                            ? 'rgba(16,185,129,.15)'
                            : selectedDealIds.has(d.id) ? 'rgba(59,130,246,.1)' : 'transparent',
                          cursor: 'pointer',
                        }}
                        onClick={() => {
                          if (migratedDealIds.has(d.id)) {
                            // Снять статус "Перенесено" -> выбрать заново
                            const newMig = new Set(migratedDealIds);
                            newMig.delete(d.id);
                            setMigratedDealIds(newMig);
                            localStorage.setItem('migrated_deal_ids', JSON.stringify([...newMig]));
                            const nextSel = new Set(selectedDealIds);
                            nextSel.add(d.id);
                            setSelectedDealIds(nextSel);
                          } else {
                            const next = new Set(selectedDealIds);
                            if (next.has(d.id)) next.delete(d.id); else next.add(d.id);
                            setSelectedDealIds(next);
                          }
                        }}
                      >
                        <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                          {migratedDealIds.has(d.id)
                            ? <span title="Перенесено — нажмите чтобы выбрать заново" style={{ color: '#10b981', fontSize: 14, lineHeight: 1 }}>✅</span>
                            : <input type="checkbox" checked={selectedDealIds.has(d.id)} onChange={() => {}} style={{ pointerEvents: 'none' }} />
                          }
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
                      if (!res.error) {
                        const next = new Set([...migratedDealIds, ...selectedDealIds]);
                        setMigratedDealIds(next);
                        localStorage.setItem('migrated_deal_ids', JSON.stringify([...next]));
                        refreshCopyTotals();
                      }
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
                            <div style={{ marginLeft: 12, fontSize: 13, color: '#ffffff', lineHeight: 1.7 }}>
                              <div>🔹 Сделки: найдено {singleTransferResult.tasksDetail.leads?.found ?? '—'}, перенесено <strong>{singleTransferResult.tasksDetail.leads?.created ?? '—'}</strong></div>
                              <div>🔹 Контакты: найдено {singleTransferResult.tasksDetail.contacts?.found ?? '—'}, перенесено <strong>{singleTransferResult.tasksDetail.contacts?.created ?? '—'}</strong></div>
                              <div>🔹 Компании: найдено {singleTransferResult.tasksDetail.companies?.found ?? '—'}, перенесено <strong>{singleTransferResult.tasksDetail.companies?.created ?? '—'}</strong></div>
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, color: '#94a3b8' }}>(задачи сделок из кэша)</div>
                          )}
                        </div>
                        <div style={{ marginTop: 4 }}>
                          <div><strong>Заметки:</strong> {singleTransferResult.transferred?.notes} перенесено</div>
                          {singleTransferResult.notesDetail ? (
                            <div style={{ marginLeft: 12, fontSize: 13, color: '#ffffff', lineHeight: 1.7 }}>
                              <div>🔹 Сделки: скачано {singleTransferResult.notesDetail.leads?.fetched ?? '—'}, перенесено <strong>{singleTransferResult.notesDetail.leads?.transferred ?? '—'}</strong></div>
                              <div>🔹 Контакты: скачано {singleTransferResult.notesDetail.contacts?.fetched ?? '—'}, перенесено <strong>{singleTransferResult.notesDetail.contacts?.transferred ?? '—'}</strong></div>
                              <div>🔹 Компании: скачано {singleTransferResult.notesDetail.companies?.fetched ?? '—'}, перенесено <strong>{singleTransferResult.notesDetail.companies?.transferred ?? '—'}</strong></div>
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, color: '#94a3b8' }}>(Заметки сделки + контакты)</div>
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

            let pairs = [];
            let source = null;
            if (syncResult?.stageMapping) {
              // Always use fresh data from the sync API response.
              // If either is missing — the server returned an error (shown via setMessage).
              // Never fall back to stale cached pipelines.amo/kommo list.
              const freshKommoSt = syncResult.kommoPipeline?.statuses;
              const freshAmoSt   = syncResult.amoPipeline?.statuses;
              if (!freshAmoSt || !freshKommoSt) {
                // Sync response incomplete — do not display stale data
                return (
                  <div className="warning-banner">
                    ⚠️ Данные синхронизации неполные. Попробуйте «Синхронизировать этапы» ещё раз.
                  </div>
                );
              }
              pairs = buildStagePairs(syncResult, freshAmoSt, freshKommoSt);
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
                          localStorage.removeItem('syncResult');
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
                          localStorage.removeItem('syncResult');
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
        <FieldSync isActive={tab === 'fields'} cacheRefreshKey={cacheRefreshKey} />
      </div>

      {tab === 'copy' && (
        <CopyDeals />
      )}

      {tab === 'backups' && (
        <div className="card">
          <h2>💾 Резервные копии</h2>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-muted,#888)' }}>
            Бэкап содержит кэш данных AMO CRM: <strong>сделки, контакты, компании, задачи</strong> —
            загруженные в момент операции «Загрузить данные из AMO». Данные в AMO CRM не удаляются.
          </p>
          <div style={{ marginBottom: 16 }}>
            <button className="btn" onClick={async () => {
              try {
                const r = await createBackupNow();
                const s = r.stats || {};
                setMessage('✅ Бэкап создан: ' + (s.leads||0) + ' сделок, ' + (s.contacts||0) + ' контактов, ' + (s.companies||0) + ' компаний');
                if (typeof fetchBackups === 'function') fetchBackups();
              } catch(e) { setMessage('❌ Ошибка: ' + (e?.response?.data?.error || e.message)); }
            }}>
              💾 Создать резервную копию сейчас
            </button>
          </div>
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
      {tab === 'versions' && (
        <div className="card versions-tab">
          <h2>📋 История версий</h2>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted,#999)' }}>
            Хронология изменений системы миграции AMO → Kommo CRM. Текущая версия: <strong style={{ color: '#fff' }}>{appVersion}</strong>
          </p>
          {versionHistory.length === 0 ? (
            <div className="no-data">Загрузка истории версий...</div>
          ) : (
            <div className="version-timeline">
              {versionHistory.map((v, i) => (
                <div key={v.version} className={`version-entry${i === 0 ? ' version-current' : ''}`}>
                  <div className="version-header">
                    <span className="version-badge">{v.version}</span>
                    <span className="version-date">{v.date}</span>
                    {i === 0 && <span className="version-current-label">текущая</span>}
                  </div>
                  <div className="version-title">{v.title}</div>
                  <ul className="version-changes">
                    {v.changes.map((c, j) => (
                      <li key={j}>{c}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
