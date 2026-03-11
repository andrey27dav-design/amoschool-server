// V1.6.23: Fix countdown restarting during batch transfer
// Problem: When countdown hits 0, status briefly shows auto-waiting from server → new countdown starts
// Fix: Add continueSignalSentRef — prevents re-entering countdown after continue was sent

const fs = require('fs');
const appPath = '/var/www/amoschool/frontend/src/App.jsx';
let app = fs.readFileSync(appPath, 'utf8');
const orig = app;

// 1. Add ref after prevBatchStatusRef
app = app.replace(
  `  const prevBatchStatusRef = useRef(null);`,
  `  const prevBatchStatusRef = useRef(null);
  const continueSignalSentRef = useRef(false); // prevents countdown restart after continue signal`
);

// 2. In the auto-waiting branch, check the ref before starting countdown
app = app.replace(
  `    // ── auto-waiting: pure client-side countdown 60→0, then signal server ──
    if (st === 'auto-waiting') {
      let cancelled = false;`,
  `    // ── auto-waiting: pure client-side countdown 60→0, then signal server ──
    if (st === 'auto-waiting') {
      // If continue was already sent, skip countdown — wait for server to switch to 'running'
      if (continueSignalSentRef.current) {
        let polling = true;
        const waitForRunning = async () => {
          while (polling) {
            try {
              const d = await api.getBatchStatus();
              if (!polling) break;
              setBatchStatusData(d);
              if (d.status === 'running' || d.status === 'idle' || d.status === 'completed' || d.status === 'error') {
                continueSignalSentRef.current = false;
                break;
              }
            } catch {}
            await new Promise(r => setTimeout(r, 1000));
          }
        };
        waitForRunning();
        return () => { polling = false; };
      }
      let cancelled = false;`
);

// 3. Set the ref when countdown hits 0 and continue is called
app = app.replace(
  `          if (next <= 0) {
            // Countdown done — tell server to start next batch
            api.continueAutoRun().then(() => {`,
  `          if (next <= 0) {
            // Countdown done — tell server to start next batch
            continueSignalSentRef.current = true;
            api.continueAutoRun().then(() => {`
);

// 4. Reset the ref when starting a new auto-run cycle
app = app.replace(
  `  const handleStartAutoRun = async () => {
    setLastBatchResult(null); // clear previous results for fresh start`,
  `  const handleStartAutoRun = async () => {
    continueSignalSentRef.current = false;
    setLastBatchResult(null); // clear previous results for fresh start`
);

// 5. Reset the ref when stopping
app = app.replace(
  `  const handleStopAutoRun = async () => {
    try {`,
  `  const handleStopAutoRun = async () => {
    continueSignalSentRef.current = false;
    try {`
);

if (app === orig) {
  console.error('ERROR: No changes made!');
  process.exit(1);
}

fs.writeFileSync(appPath, app, 'utf8');
console.log('✅ App.jsx: countdown no longer restarts after continue signal');

// Update versions
const versionsPath = '/var/www/amoschool/backend/src/versions.js';
let versions = fs.readFileSync(versionsPath, 'utf8');
versions = versions.replace(
  "const VERSIONS = [\n  {",
  `const VERSIONS = [
  {
    version: 'V1.6.23',
    date: '2026-03-09',
    title: 'Обратный отсчёт только между пакетами',
    changes: [
      'Обратный отсчёт больше не перезапускается во время передачи пакета',
      'После сигнала continue фронтенд ждёт переключения на running без повторного таймера',
    ],
  },
  {`
);
fs.writeFileSync(versionsPath, versions, 'utf8');
console.log('✅ Versions: V1.6.23 added');
console.log('\n=== DONE ===');
