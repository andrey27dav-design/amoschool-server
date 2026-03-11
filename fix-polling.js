const fs = require('fs');
const f = '/var/www/amoschool/frontend/src/App.jsx';
let code = fs.readFileSync(f, 'utf8');

// FIX 1: Polling useEffect — add auto-waiting to polling conditions
// The polling only runs for 'running' and 'rolling_back', but auto-waiting needs polling too for countdown
const oldPollCondition = "if (batchStatus?.status !== 'running' && batchStatus?.status !== 'rolling_back') return;";
const newPollCondition = "if (batchStatus?.status !== 'running' && batchStatus?.status !== 'rolling_back' && batchStatus?.status !== 'auto-waiting') return;";

if (code.includes(oldPollCondition)) {
  code = code.replace(oldPollCondition, newPollCondition);
  console.log('✅ FIX 1: Added auto-waiting to polling condition');
} else if (code.includes(newPollCondition)) {
  console.log('⏭ FIX 1: Already patched');
} else {
  console.log('❌ FIX 1: Could not find polling condition');
}

// FIX 2: polling clearInterval — also keep polling during auto-waiting
const oldClear = "if (d.status !== 'running' && d.status !== 'rolling_back') {";
const newClear = "if (d.status !== 'running' && d.status !== 'rolling_back' && d.status !== 'auto-waiting') {";

if (code.includes(oldClear)) {
  code = code.replace(oldClear, newClear);
  console.log('✅ FIX 2: Added auto-waiting to clearInterval condition');
} else if (code.includes(newClear)) {
  console.log('⏭ FIX 2: Already patched');
} else {
  console.log('❌ FIX 2: Could not find clearInterval condition');
}

fs.writeFileSync(f, code, 'utf8');
console.log('Done. Lines:', code.split('\n').length);
