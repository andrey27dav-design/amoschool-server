// V1.6.22: Show batch results and countdown independently
// Problem: When status changes to 'auto-waiting', the 'completed' block with batch results disappears
// Solution: Save last batch results in separate state, show it alongside countdown

const fs = require('fs');
const appPath = '/var/www/amoschool/frontend/src/App.jsx';
let app = fs.readFileSync(appPath, 'utf8');
const orig = app;

// 1. Add lastBatchResult state after crashDetected state
app = app.replace(
  "const [crashDetected, setCrashDetected] = useState(false);",
  "const [crashDetected, setCrashDetected] = useState(false);\n  const [lastBatchResult, setLastBatchResult] = useState(null); // persists across status changes"
);

// 2. Save batch results when status transitions to auto-waiting
// In the useEffect, when we detect auto-waiting, save the current createdIds/warnings/errors
// Find the place where setBatchStatusData(d) is called in the running poll
// We need to capture results BEFORE status changes to auto-waiting
// Best place: when server returns auto-waiting status, save previous batch results

// Actually, simpler: save results whenever we get a 'completed' status with createdIds,
// and also when transitioning from running to auto-waiting the backend sends createdIds in the state.
// Let's check: does the backend include createdIds when setting auto-waiting?
// Looking at backend code - it does updateState with status:'auto-waiting' but createdIds come from the batch run.
// The batch results are in batchState from runBatchMigration, and auto-waiting overwrites with updateState.
// So createdIds get lost when auto-waiting starts.

// Better approach: save last batch result in the backend auto-waiting state
// OR save it on the client when we see status transition from running to something else.

// Simplest client approach: in the polling useEffect, when we get fresh data from server
// and it has createdIds, save them to lastBatchResult.

// In the useEffect for running status, after setBatchStatusData(d):
app = app.replace(
  `          setBatchStatusData(d);
          // Terminal states: fetch full stats and stop polling
          if (d.status !== 'running' && d.status !== 'rolling_back') {`,
  `          setBatchStatusData(d);
          // Save batch results whenever we have them (persists during auto-waiting)
          if (d.createdIds) {
            setLastBatchResult({
              createdIds: d.createdIds,
              warnings: d.warnings || [],
              errors: d.errors || [],
            });
          }
          // Terminal states: fetch full stats and stop polling
          if (d.status !== 'running' && d.status !== 'rolling_back') {`
);

// 3. Also save results from the initial status fetch (handleStartBatch etc.)
// When status is loaded on page load or after starting auto-run, and server already has createdIds
// Add to the fetchBatchStatus or wherever the initial batchStatus is set
// Let's add it in the general polling effect init too

// 4. Now fix the display: show batch results when status is EITHER 'completed' OR 'auto-waiting'
// and we have lastBatchResult or createdIds

// Replace the condition for showing completion stats
app = app.replace(
  `            {/* Completion stats */}
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
            )}`,
  `            {/* Completion stats — visible during completed AND auto-waiting */}
            {(() => {
              const res = batchStatus?.createdIds ? batchStatus : lastBatchResult;
              const show = res?.createdIds && (batchStatus?.status === 'completed' || batchStatus?.status === 'auto-waiting' || batchStatus?.status === 'auto-stopped');
              if (!show) return null;
              return (
              <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, padding: '10px 14px', marginTop: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#86efac', marginBottom: 6 }}>✅ Пакет завершён</div>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12, color: '#cbd5e1' }}>
                  <span>Сделок: <b style={{color:'#fff'}}>{res.createdIds.leads?.length ?? 0}</b></span>
                  <span>Контактов: <b style={{color:'#fff'}}>{res.createdIds.contacts?.length ?? 0}</b></span>
                  <span>Компаний: <b style={{color:'#fff'}}>{res.createdIds.companies?.length ?? 0}</b></span>
                  <span>Задач: <b style={{color:'#fff'}}>{res.createdIds.tasks?.length ?? 0}</b></span>
                  <span>Заметок: <b style={{color:'#fff'}}>{res.createdIds.notes?.length ?? 0}</b></span>
                  <span>⚠️ предупреждений: <b style={{color: (res.warnings?.length || 0) > 0 ? '#fbbf24':'#fff'}}>{res.warnings?.length ?? 0}</b></span>
                  <span>❌ ошибок: <b style={{color: (res.errors?.length || 0) > 0 ? '#f87171':'#fff'}}>{res.errors?.length ?? 0}</b></span>
                </div>
              </div>
              );
            })()}`
);

// 5. Also keep warnings visible during auto-waiting
// Currently warnings are: {batchStatus?.warnings?.length > 0 && (...)}
// They need to use lastBatchResult too when in auto-waiting
app = app.replace(
  `            {/* Batch warnings */}
            {batchStatus?.warnings?.length > 0 && (`,
  `            {/* Batch warnings */}
            {((batchStatus?.warnings?.length > 0) || (batchStatus?.status === 'auto-waiting' && lastBatchResult?.warnings?.length > 0)) && ((() => {
              const warnings = batchStatus?.warnings?.length > 0 ? batchStatus.warnings : lastBatchResult?.warnings || [];
              return warnings.length > 0;
            })()) && (`
);

// Hmm that's getting complex. Let me simplify - just use a variable approach.
// Actually let me revert that last change and do it differently.
// The warnings block references batchStatus.warnings directly inside. 
// Simplest fix: also show warnings when auto-waiting and we have lastBatchResult

// Let me just re-read the warnings block and make it use the same res pattern
// Actually the simplest approach: just save the entire batchStatus as lastBatchResult when it has createdIds,
// and show lastBatchResult when auto-waiting. The warnings block already references batchStatus.warnings.

// Let me undo the complex warnings change and instead take a different approach:
// Revert the bad warnings replacement by putting it back
app = app.replace(
  `            {/* Batch warnings */}
            {((batchStatus?.warnings?.length > 0) || (batchStatus?.status === 'auto-waiting' && lastBatchResult?.warnings?.length > 0)) && ((() => {
              const warnings = batchStatus?.warnings?.length > 0 ? batchStatus.warnings : lastBatchResult?.warnings || [];
              return warnings.length > 0;
            })()) && (`,
  `            {/* Batch warnings */}
            {(batchStatus?.warnings?.length > 0 || (batchStatus?.status === 'auto-waiting' && lastBatchResult?.warnings?.length > 0)) && (`
);

// Now inside the warnings block, we need to use the right source.
// Find where it maps batchStatus.warnings and make it use lastBatchResult as fallback
app = app.replace(
  `                {batchStatus.warnings.slice(0, 8).map((w, i) => (`,
  `                {(batchStatus?.warnings?.length > 0 ? batchStatus.warnings : lastBatchResult?.warnings || []).slice(0, 8).map((w, i) => (`
);

app = app.replace(
  `                {batchStatus.warnings.length > 8 && (
                  <div className="more">...и ещё {batchStatus.warnings.length - 8} предупреждений</div>`,
  `                {(batchStatus?.warnings?.length || lastBatchResult?.warnings?.length || 0) > 8 && (
                  <div className="more">...и ещё {(batchStatus?.warnings?.length || lastBatchResult?.warnings?.length || 0) - 8} предупреждений</div>`
);

// Fix the warnings count header too
app = app.replace(
  `<div className="batch-section-title">⚠️ Предупреждения ({batchStatus.warnings.length})</div>`,
  `<div className="batch-section-title">⚠️ Предупреждения ({batchStatus?.warnings?.length || lastBatchResult?.warnings?.length || 0})</div>`
);

// 6. Clear lastBatchResult when a new batch starts (status becomes 'running' from something else)
// Add to the handleStartBatch and handleStartAutoRun
app = app.replace(
  `  const handleStartAutoRun = async () => {
    if (batchSize === 0 || !batchSize) {`,
  `  const handleStartAutoRun = async () => {
    setLastBatchResult(null); // clear previous results for fresh start
    if (batchSize === 0 || !batchSize) {`
);

if (app === orig) {
  console.error('ERROR: No changes made!');
  process.exit(1);
}

fs.writeFileSync(appPath, app, 'utf8');
console.log('✅ App.jsx: batch results persist during auto-waiting countdown');

// 7. Update versions
const versionsPath = '/var/www/amoschool/backend/src/versions.js';
let versions = fs.readFileSync(versionsPath, 'utf8');
versions = versions.replace(
  "const VERSIONS = [\n  {",
  `const VERSIONS = [
  {
    version: 'V1.6.22',
    date: '2026-03-09',
    title: 'Результаты пакета видны во время обратного отсчёта',
    changes: [
      'Блок «Пакет завершён» остаётся видимым во время 60-сек паузы',
      'Обратный отсчёт и результаты пакета показываются одновременно',
      'Предупреждения пакета также видны во время паузы',
      'Пользователь может проверить результаты и решить — Стоп или продолжить',
    ],
  },
  {`
);
fs.writeFileSync(versionsPath, versions, 'utf8');
console.log('✅ Versions: V1.6.22 added');
console.log('\n=== ALL DONE ===');
