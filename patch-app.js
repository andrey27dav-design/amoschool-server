// Patch App.jsx for auto-run feature
const fs = require('fs');
let code = fs.readFileSync('C:\\crm-migration\\temp-App.jsx', 'utf8');

// 1. Add auto-run handlers after handleBatchPause
const pauseHandlerEnd = `    } catch (e) {
      setMessage('❌ ' + (e.response?.data?.error || e.message));
    }
  };

  const handleBatchReset`;

const autoRunHandlers = `    } catch (e) {
      setMessage('❌ ' + (e.response?.data?.error || e.message));
    }
  };

  const handleStartAutoRun = async () => {
    if (batchSize === 0 || !batchSize) {
      setMessage('❌ Выберите размер пакета (1–200) перед запуском автозапуска');
      return;
    }
    if (!confirm(\`Запустить автозапуск? Пакеты по \${batchSize} сделок будут переноситься автоматически с паузой 60 сек между ними. Нажмите «⏹ Стоп» для остановки.\`)) return;
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
      setMessage(\`❌ Ошибка: \${e.response?.data?.error || e.message}\`);
    }
    setBatchLoading(false);
  };

  const handleStopAutoRun = async () => {
    try {
      await api.stopAutoRun();
      setMessage('⏹ Запрос остановки автозапуска отправлен. Текущий пакет завершится.');
      setTimeout(async () => {
        const [d, s] = await Promise.all([api.getBatchStatus(), api.getBatchStats()]).catch(() => [null, null]);
        if (d) setBatchStatusData(d);
        if (s) setBatchStats(s);
      }, 2000);
    } catch (e) {
      setMessage('❌ ' + (e.response?.data?.error || e.message));
    }
  };

  const handleBatchReset`;

code = code.replace(pauseHandlerEnd, autoRunHandlers);

// 2. Replace ВСЕ button + main button + pause button section
// Find the old ВСЕ button
const oldButtons = `                <button
                  className={\`batch-size-btn\${batchSize === 0 ? ' active' : ''}\`}
                  onClick={() => handleBatchSizeChange(0)}
                  disabled={batchStatus?.status === 'running'}>
                  ВСЕ
                </button>
              </div>
              <button className="btn btn-primary" onClick={handleStartBatch}
                disabled={batchLoading || batchStatus?.status === 'running' || batchStats?.remainingLeads === 0}>
                {batchStatus?.status === 'running'
                  ? \`⏳ \${batchStatus.step || 'Выполняется...'}\`
                  : batchSize === 0
                    ? '🚀 Перенести ВСЕ сделки'
                    : \`🚀 Перенести первые \${batchSize} неотработанных\`}
              </button>
              {batchStatus?.status === 'running' && (
                <button className="btn btn-warn" onClick={handleBatchPause}
                  disabled={batchLoading}
                  title="Остановить на ближайшей контрольной точке">
                  ⏸ Пауза
                </button>
              )}`;

const newButtons = `              </div>
              <button className="btn btn-primary" onClick={handleStartBatch}
                disabled={batchLoading || batchStatus?.status === 'running' || batchStatus?.status === 'auto-waiting' || batchStatus?.autoRunActive || batchStats?.remainingLeads === 0}>
                {batchStatus?.status === 'running'
                  ? \`⏳ \${batchStatus.step || 'Выполняется...'}\`
                  : batchStatus?.status === 'auto-waiting'
                    ? \`⏳ Пауза \${batchStatus.autoRunCountdown || ''}с...\`
                    : \`🚀 Перенести \${batchSize || 10} сделок\`}
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
              )}`;

if (code.includes(oldButtons)) {
  code = code.replace(oldButtons, newButtons);
  console.log('✅ Buttons replaced');
} else {
  console.log('❌ Could not find old buttons block');
  // Debug: find ВСЕ button
  const idx = code.indexOf('ВСЕ');
  if (idx >= 0) console.log('  Found ВСЕ at index', idx, 'context:', code.substring(idx - 100, idx + 50));
}

// 3. Replace time estimate section and add auto-run banners before it
const oldEstimate = `            {/* Time estimate */}
            {batchStatus?.status !== 'running' && batchSize > 0 && (
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6, marginBottom: 2 }}>
                ⏱ Прогноз: ~{Math.max(1, Math.round(batchSize * 1.5 * 1.3 / 60))} мин для {batchSize} сделок
                {batchStats?.remainingLeads > 0 && \` · Осталось: \${batchStats.remainingLeads}\`}
              </div>
            )}`;

const newEstimate = `            {/* Auto-run countdown banner */}
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
                {batchStats?.remainingLeads > 0 && \` · Осталось: \${batchStats.remainingLeads}\`}
              </div>
            )}`;

if (code.includes(oldEstimate)) {
  code = code.replace(oldEstimate, newEstimate);
  console.log('✅ Estimate + banners replaced');
} else {
  console.log('❌ Could not find old estimate block');
}

fs.writeFileSync('C:\\crm-migration\\temp-App.jsx', code, 'utf8');
console.log('Done. Lines:', code.split('\n').length);
