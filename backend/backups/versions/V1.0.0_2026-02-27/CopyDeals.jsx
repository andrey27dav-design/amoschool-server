/**
 * CopyDeals — Deal copy workflow panel.
 * Flow: Select pipelines → Select manager → Fetch → Preview → Copy → Progress → Rollback
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import * as api from './api';

// ─── Status helpers ──────────────────────────────────────────────────────────
const STATUS_COLOR = {
  pending:     '#94a3b8',
  fetching:    '#3b82f6',
  fetched:     '#8b5cf6',
  copying:     '#f59e0b',
  completed:   '#10b981',
  error:       '#ef4444',
  rolled_back: '#6b7280',
};

const STATUS_LABEL = {
  pending:     'Ожидание',
  fetching:    'Выгрузка...',
  fetched:     'Данные загружены',
  copying:     'Копирование...',
  completed:   'Завершено',
  error:       'Ошибка',
  rolled_back: 'Откатано',
};

// ─── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ value, max, color = '#3b82f6' }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ background: '#e2e8f0', borderRadius: 8, height: 12, overflow: 'hidden', margin: '8px 0' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.3s', borderRadius: 8 }} />
    </div>
  );
}

// ─── Warning modal ────────────────────────────────────────────────────────────
function WarningModal({ message, onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, maxWidth: 480, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <h3 style={{ color: '#dc2626', margin: '0 0 12px' }}>⚠️ Подтверждение</h3>
        <p style={{ color: '#374151', lineHeight: 1.6, margin: '0 0 24px' }}>{message}</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer' }}>Отмена</button>
          <button onClick={onConfirm} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Подтвердить</button>
        </div>
      </div>
    </div>
  );
}

// ─── Deal preview modal ───────────────────────────────────────────────────────
function DealsPreviewModal({ sessionId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.getSessionPreview(sessionId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const filtered = data?.leads?.filter(l =>
    !search || l.name?.toLowerCase().includes(search.toLowerCase()) || String(l.id).includes(search)
  ) || [];

  const copyStatusColor = { pending: '#94a3b8', created: '#10b981', skipped: '#f59e0b', error: '#ef4444', rolled_back: '#6b7280' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 900, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0 }}>Предпросмотр сделок</h3>
            {data && (
              <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
                {data.summary.total_leads} сделок · {data.summary.total_contacts} контактов · {data.summary.total_companies} компаний
              </p>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#6b7280' }}>✕</button>
        </div>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #e5e7eb' }}>
          <input
            placeholder="Поиск по имени или ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Загрузка...</div>
          ) : !data ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#ef4444' }}>Ошибка загрузки данных</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                  <th style={{ padding: '10px 8px', textAlign: 'left', border: '1px solid #e5e7eb' }}>ID</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left', border: '1px solid #e5e7eb' }}>Сделка</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', border: '1px solid #e5e7eb' }}>Бюджет</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left', border: '1px solid #e5e7eb' }}>Этап</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', border: '1px solid #e5e7eb' }}>Контакты</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', border: '1px solid #e5e7eb' }}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(lead => (
                  <tr key={lead.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px', color: '#6b7280', fontFamily: 'monospace', border: '1px solid #f1f5f9' }}>{lead.id}</td>
                    <td style={{ padding: '8px', border: '1px solid #f1f5f9' }}>
                      <div style={{ fontWeight: 500 }}>{lead.name || '(без имени)'}</div>
                      {lead.kommo_id && <div style={{ fontSize: 11, color: '#6b7280' }}>Kommo: {lead.kommo_id}</div>}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #f1f5f9' }}>{lead.price ? `${lead.price.toLocaleString('ru-RU')} ₽` : '—'}</td>
                    <td style={{ padding: '8px', fontSize: 12, border: '1px solid #f1f5f9' }}>{lead.stage_name || lead.status_id}</td>
                    <td style={{ padding: '8px', textAlign: 'center', border: '1px solid #f1f5f9' }}>{lead.contacts_count}</td>
                    <td style={{ padding: '8px', textAlign: 'center', border: '1px solid #f1f5f9' }}>
                      <span style={{ background: copyStatusColor[lead.copy_status] || '#94a3b8', color: '#fff', padding: '2px 8px', borderRadius: 12, fontSize: 11 }}>
                        {lead.copy_status}
                      </span>
                      {lead.error && <div style={{ color: '#ef4444', fontSize: 11, marginTop: 2 }}>{lead.error}</div>}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#6b7280' }}>Нет данных</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Session log panel ────────────────────────────────────────────────────────
function SessionLog({ sessionId }) {
  const [logs, setLogs] = useState([]);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!sessionId) return;
    const poll = () => {
      api.getSessionLog(sessionId, 80)
        .then(r => setLogs(r.logs || []))
        .catch(() => {});
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const levelColor = { info: '#10b981', warn: '#f59e0b', error: '#ef4444' };

  return (
    <div style={{ background: '#0f172a', borderRadius: 8, padding: '12px 16px', maxHeight: 220, overflow: 'auto', fontFamily: 'monospace', fontSize: 12 }}>
      {logs.length === 0 ? (
        <div style={{ color: '#64748b' }}>Лог пуст...</div>
      ) : (
        logs.slice().reverse().map((l, i) => (
          <div key={i} style={{ marginBottom: 2 }}>
            <span style={{ color: '#64748b' }}>{new Date(l.created_at).toLocaleTimeString('ru-RU')} </span>
            <span style={{ color: levelColor[l.level] || '#94a3b8', fontWeight: 'bold' }}>[{l.level?.toUpperCase()}] </span>
            <span style={{ color: '#e2e8f0' }}>{l.message}</span>
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}

// ─── Sessions history ─────────────────────────────────────────────────────────
function SessionsHistory({ onResume }) {
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    api.getSessions().then(r => setSessions(r.sessions || [])).catch(() => {});
    const t = setInterval(() => {
      api.getSessions().then(r => setSessions(r.sessions || [])).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, []);

  if (sessions.length === 0) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>История сессий</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #e5e7eb' }}>ID</th>
            <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #e5e7eb' }}>Статус</th>
            <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #e5e7eb' }}>Всего</th>
            <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #e5e7eb' }}>Скопировано</th>
            <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #e5e7eb' }}>Ошибок</th>
            <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #e5e7eb' }}>Создана</th>
            <th style={{ padding: '8px', border: '1px solid #e5e7eb' }}></th>
          </tr>
        </thead>
        <tbody>
          {sessions.map(s => (
            <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '8px', border: '1px solid #f1f5f9', fontFamily: 'monospace' }}>#{s.id}</td>
              <td style={{ padding: '8px', border: '1px solid #f1f5f9' }}>
                <span style={{ background: STATUS_COLOR[s.status] || '#94a3b8', color: '#fff', padding: '2px 8px', borderRadius: 12, fontSize: 11 }}>
                  {STATUS_LABEL[s.status] || s.status}
                </span>
              </td>
              <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #f1f5f9' }}>{s.total_deals}</td>
              <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #f1f5f9', color: '#10b981', fontWeight: 600 }}>{s.copied_deals}</td>
              <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #f1f5f9', color: s.error_count > 0 ? '#ef4444' : '#374151' }}>{s.error_count}</td>
              <td style={{ padding: '8px', border: '1px solid #f1f5f9', color: '#6b7280', fontSize: 12 }}>{new Date(s.created_at).toLocaleString('ru-RU')}</td>
              <td style={{ padding: '8px', border: '1px solid #f1f5f9', textAlign: 'center' }}>
                {(s.status === 'fetched' || s.status === 'copying' || s.status === 'completed') && (
                  <button onClick={() => onResume(s)} style={{ padding: '4px 12px', fontSize: 12, borderRadius: 6, border: '1px solid #3b82f6', background: 'none', color: '#3b82f6', cursor: 'pointer' }}>
                    Открыть
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main CopyDeals component ─────────────────────────────────────────────────
export default function CopyDeals() {
  const [amoPipelines, setAmoPipelines]       = useState([]);
  const [kommoPipelines, setKommoPipelines]   = useState([]);
  const [managers, setManagers]               = useState([]);
  const [loadingPipelines, setLoadingPipelines] = useState(false);

  // Wizard step: 'setup' | 'fetching' | 'fetched' | 'copying' | 'done'
  const [step, setStep]      = useState('setup');
  const [session, setSession] = useState(null);

  // Form state
  const [amoPipeline, setAmoPipeline]     = useState('');
  const [kommoPipeline, setKommoPipeline] = useState('');
  const [selectedManager, setSelectedManager] = useState(null);

  // Progress state (from SSE)
  const [progress, setProgress]   = useState({ current: 0, total: 0 });
  const [dealResults, setDealResults] = useState([]);
  const [lastError, setLastError]    = useState(null);
  const [copyDone, setCopyDone]      = useState(false);

  // UI state
  const [showPreview, setShowPreview]   = useState(false);
  const [warning, setWarning]           = useState(null);
  const [message, setMessage]           = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const sseRef = useRef(null);

  // Load pipelines and managers
  useEffect(() => {
    setLoadingPipelines(true);
    Promise.all([
      api.getAmoPipelines().catch(() => ({ amo: [] })),
      api.getKommoPipelines().catch(() => ({ kommo: [] })),
      api.getManagers().catch(() => ({ managers: [] })),
    ]).then(([amo, kommo, mgrs]) => {
      setAmoPipelines(amo.amo || []);
      setKommoPipelines(kommo.kommo || []);
      setManagers(mgrs.managers || []);
    }).finally(() => setLoadingPipelines(false));
  }, []);

  // SSE subscribe
  const connectSSE = useCallback((sessionId) => {
    if (sseRef.current) sseRef.current.close();
    const url = `${import.meta.env.VITE_API_URL || 'https://wisper.aikonver.ru/api'}/copy/${sessionId}/stream`;
    const es = new EventSource(url);
    sseRef.current = es;

    es.onmessage = (evt) => {
      if (!evt.data) return;
      let ev;
      try { ev = JSON.parse(evt.data); } catch { return; }

      switch (ev.type) {
        case 'status':
          setStep(ev.status === 'fetching' ? 'fetching' : ev.status === 'copying' ? 'copying' : step);
          setMessage(ev.message || '');
          break;
        case 'fetched':
          setStep('fetched');
          setProgress({ current: 0, total: ev.total_deals });
          setMessage(ev.message || '');
          break;
        case 'progress':
          setProgress({ current: ev.current, total: ev.total });
          setMessage(ev.message || '');
          break;
        case 'deal_result':
          setDealResults(prev => [...prev, ev]);
          break;
        case 'deal_error':
          setDealResults(prev => [...prev, { ...ev, status: 'error' }]);
          setLastError(ev);
          break;
        case 'completed':
          setStep('done');
          setCopyDone(true);
          setProgress({ current: ev.total, total: ev.total });
          setMessage(ev.message || '');
          es.close();
          break;
        case 'error':
          setLastError(ev);
          setMessage(ev.message || '');
          break;
        default:
          break;
      }
    };
    es.onerror = () => {};
  }, [step]);

  useEffect(() => {
    return () => sseRef.current?.close();
  }, []);

  // Start fetch
  const handleFetch = async () => {
    if (!amoPipeline || !kommoPipeline || !selectedManager) {
      setMessage('⚠️ Выберите воронки и менеджера');
      return;
    }
    setActionLoading(true);
    setMessage('');
    setDealResults([]);
    setLastError(null);
    setCopyDone(false);

    try {
      const resp = await api.fetchSessionDeals({
        amo_pipeline_id: amoPipeline,
        amo_user_id: selectedManager.amo_id,
        kommo_pipeline_id: kommoPipeline,
        kommo_user_id: selectedManager.kommo_user_id || 0,
        amo_user_name: selectedManager.amo_name,
      });
      const s = { id: resp.session_id, status: 'fetching' };
      setSession(s);
      setStep('fetching');
      connectSSE(resp.session_id);
    } catch (err) {
      setMessage(`❌ Ошибка: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Start copy
  const handleCopy = () => {
    setWarning({
      message: `Начать копирование ${progress.total} сделок из AMO в Kommo? Данные в AMO CRM НЕ будут удалены. Операция займёт несколько минут.`,
      onConfirm: async () => {
        setWarning(null);
        setActionLoading(true);
        setStep('copying');
        try {
          await api.startCopySession(session.id);
          connectSSE(session.id);
        } catch (err) {
          setMessage(`❌ Ошибка запуска: ${err.message}`);
          setStep('fetched');
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  // Rollback last deal
  const handleRollbackLast = () => {
    setWarning({
      message: 'Откатить последнюю скопированную сделку? Сделка, её задачи и заметки будут удалены из Kommo CRM.',
      onConfirm: async () => {
        setWarning(null);
        setActionLoading(true);
        try {
          const r = await api.rollbackLastDeal(session.id);
          setMessage(r.status === 'ok'
            ? `✅ Последняя сделка откатана (kommo_id=${r.rolled_back_lead?.kommo_id})`
            : r.message || 'Нечего откатывать');
        } catch (err) {
          setMessage(`❌ Ошибка отката: ${err.message}`);
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  // Rollback full session
  const handleRollbackSession = () => {
    setWarning({
      message: '⚠️ ВНИМАНИЕ! Будут удалены все сделки, контакты и компании, созданные в этой сессии в Kommo CRM. Действие необратимо. Продолжить?',
      onConfirm: async () => {
        setWarning(null);
        setActionLoading(true);
        try {
          const r = await api.rollbackSession(session.id);
          setMessage(`✅ Сессия откатана: удалено ${r.deleted} записей ${r.errors?.length ? `(${r.errors.length} ошибок)` : ''}`);
          setStep('setup');
          setSession(null);
          setCopyDone(false);
        } catch (err) {
          setMessage(`❌ Ошибка отката сессии: ${err.message}`);
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  // Resume an existing session
  const handleResume = (s) => {
    setSession(s);
    if (s.status === 'fetched') {
      setStep('fetched');
      setProgress({ current: 0, total: s.total_deals });
    } else if (s.status === 'copying') {
      setStep('copying');
      connectSSE(s.id);
    } else if (s.status === 'completed') {
      setStep('done');
      setCopyDone(true);
      setProgress({ current: s.total_deals, total: s.total_deals });
    }
  };

  const copied  = dealResults.filter(r => r.status === 'ok').length;
  const skipped = dealResults.filter(r => r.status === 'skipped').length;
  const errors  = dealResults.filter(r => r.status === 'error').length;

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {warning && (
        <WarningModal
          message={warning.message}
          onConfirm={warning.onConfirm}
          onCancel={() => setWarning(null)}
        />
      )}

      {showPreview && session && (
        <DealsPreviewModal
          sessionId={session.id}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* ── HEADER ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 4px' }}>🚀 Копирование сделок AMO → Kommo</h2>
        <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
          Данные в AMO CRM не изменяются и не удаляются. Дубликаты определяются по полю <code>amo_id</code>.
        </p>
      </div>

      {message && (
        <div style={{ padding: '10px 16px', background: message.startsWith('❌') ? '#fef2f2' : '#f0fdf4', border: `1px solid ${message.startsWith('❌') ? '#fecaca' : '#bbf7d0'}`, borderRadius: 8, marginBottom: 16, fontSize: 14, color: message.startsWith('❌') ? '#dc2626' : '#15803d' }}>
          {message}
        </div>
      )}

      {/* ── STEP 1: SETUP ── */}
      {step === 'setup' && (
        <div className="card">
          <h3 style={{ margin: '0 0 20px' }}>Шаг 1: Настройка</h3>

          {loadingPipelines ? (
            <div style={{ color: '#6b7280', padding: 20, textAlign: 'center' }}>Загрузка данных...</div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 14 }}>Воронка AMO CRM</label>
                  <select
                    value={amoPipeline}
                    onChange={e => setAmoPipeline(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }}
                  >
                    <option value="">— Выберите воронку —</option>
                    {amoPipelines.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 14 }}>Воронка Kommo CRM</label>
                  <select
                    value={kommoPipeline}
                    onChange={e => setKommoPipeline(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }}
                  >
                    <option value="">— Выберите воронку —</option>
                    {kommoPipelines.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 14 }}>Менеджер (Международный ОП)</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
                  {managers.map(m => (
                    <div
                      key={m.amo_id}
                      onClick={() => setSelectedManager(m)}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 8,
                        border: `2px solid ${selectedManager?.amo_id === m.amo_id ? '#3b82f6' : '#e5e7eb'}`,
                        background: selectedManager?.amo_id === m.amo_id ? '#eff6ff' : '#f9fafb',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{m.amo_name}</div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{m.amo_email}</div>
                      <div style={{ fontSize: 11, color: '#3b82f6', marginTop: 2 }}>→ {m.kommo_email}{m.is_fallback ? ' (резерв)' : ''}</div>
                    </div>
                  ))}
                  {managers.length === 0 && (
                    <div style={{ color: '#6b7280', gridColumn: '1/-1' }}>Менеджеры группы «Международный ОП» не найдены</div>
                  )}
                </div>
              </div>

              <button
                onClick={handleFetch}
                disabled={actionLoading || !amoPipeline || !kommoPipeline || !selectedManager}
                style={{ padding: '10px 28px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', opacity: (!amoPipeline || !kommoPipeline || !selectedManager) ? 0.5 : 1 }}
              >
                {actionLoading ? 'Выгружаем...' : '📥 Выгрузить данные из AMO'}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── STEP 2: FETCHING ── */}
      {step === 'fetching' && (
        <div className="card">
          <h3 style={{ margin: '0 0 16px' }}>⏳ Выгружаем данные из AMO...</h3>
          <div style={{ animation: 'pulse 1.5s infinite', background: '#dbeafe', padding: '12px 16px', borderRadius: 8, color: '#1e40af' }}>
            {message || 'Идёт выгрузка лидов, контактов, компаний и таймлайна...'}
          </div>
          {session && <div style={{ marginTop: 16 }}><SessionLog sessionId={session.id} /></div>}
        </div>
      )}

      {/* ── STEP 3: FETCHED ── */}
      {step === 'fetched' && (
        <div className="card">
          <h3 style={{ margin: '0 0 16px' }}>✅ Данные загружены</h3>
          <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { label: 'Сделок', value: progress.total, color: '#3b82f6' },
            ].map(stat => (
              <div key={stat.label} style={{ padding: '12px 20px', background: '#f0f9ff', borderRadius: 8, textAlign: 'center', border: '1px solid #bae6fd' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>{stat.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowPreview(true)}
              style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #3b82f6', background: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: 14 }}
            >
              👁 Предпросмотр сделок
            </button>
            <button
              onClick={handleCopy}
              disabled={actionLoading}
              style={{ padding: '10px 24px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
            >
              🚀 Начать копирование ({progress.total} сделок)
            </button>
          </div>
          {session && <div style={{ marginTop: 16 }}><SessionLog sessionId={session.id} /></div>}
        </div>
      )}

      {/* ── STEP 4: COPYING ── */}
      {(step === 'copying' || step === 'done') && (
        <div className="card">
          <h3 style={{ margin: '0 0 16px' }}>{step === 'done' ? '🎉 Копирование завершено' : '⚙️ Копирование...'}</h3>

          <ProgressBar value={progress.current} max={progress.total} color={step === 'done' ? '#10b981' : '#3b82f6'} />
          <div style={{ fontSize: 14, color: '#374151', marginBottom: 16 }}>
            {progress.current} / {progress.total} сделок
            {step === 'done' && ` · ${copied} скопировано · ${skipped} пропущено · ${errors} ошибок`}
          </div>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { label: 'Скопировано', value: copied, bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
              { label: 'Пропущено', value: skipped, bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
              { label: 'Ошибок', value: errors, bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
            ].map(s => (
              <div key={s.label} style={{ padding: '10px 20px', background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Last error warning */}
          {lastError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#dc2626' }}>
              ⚠️ Последняя ошибка: <strong>{lastError.lead_name || `Сделка ${lastError.amo_id}`}</strong> — {lastError.error || lastError.message}
            </div>
          )}

          {/* Deal results - last 20 */}
          {dealResults.length > 0 && (
            <div style={{ marginBottom: 16, maxHeight: 180, overflow: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <tbody>
                  {dealResults.slice(-20).reverse().map((r, i) => (
                    <tr key={i} style={{ background: r.status === 'error' ? '#fef2f2' : r.status === 'skipped' ? '#fffbeb' : 'white' }}>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', color: '#6b7280', fontFamily: 'monospace' }}>{r.amo_id}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>{r.lead_name || r.amo_id}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>
                        {r.kommo_id && <span style={{ color: '#6b7280' }}>→ {r.kommo_id} </span>}
                        <span style={{ color: r.status === 'ok' ? '#10b981' : r.status === 'skipped' ? '#f59e0b' : '#ef4444', fontWeight: 600 }}>
                          {r.status === 'ok' ? '✓' : r.status === 'skipped' ? '~' : '✗'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Rollback buttons — only when session is active */}
          {session && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {step === 'done' && (
                <button
                  onClick={() => setShowPreview(true)}
                  style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #3b82f6', background: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: 14 }}
                >
                  👁 Просмотр результатов
                </button>
              )}
              <button
                onClick={handleRollbackLast}
                disabled={actionLoading || copied === 0}
                style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #f59e0b', background: 'none', color: '#d97706', cursor: 'pointer', fontSize: 14, opacity: copied === 0 ? 0.4 : 1 }}
              >
                ↩ Откатить последнюю сделку
              </button>
              <button
                onClick={handleRollbackSession}
                disabled={actionLoading || copied === 0}
                style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #ef4444', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 14, opacity: copied === 0 ? 0.4 : 1 }}
              >
                🗑 Откатить всю сессию
              </button>
            </div>
          )}

          {session && <div style={{ marginTop: 16 }}><SessionLog sessionId={session.id} /></div>}
        </div>
      )}

      {/* ── New session button ── */}
      {(step === 'done' || (step !== 'setup' && step !== 'fetching')) && (
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <button
            onClick={() => { setStep('setup'); setSession(null); setDealResults([]); setLastError(null); setCopyDone(false); setMessage(''); }}
            style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #94a3b8', background: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14 }}
          >
            + Новая сессия
          </button>
        </div>
      )}

      {/* ── Sessions history ── */}
      <div className="card" style={{ marginTop: 16 }}>
        <SessionsHistory onResume={handleResume} />
      </div>
    </div>
  );
}
