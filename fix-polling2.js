const fs = require('fs');
const f = '/var/www/amoschool/frontend/src/App.jsx';
let code = fs.readFileSync(f, 'utf8');
let fixes = 0;

// FIX 1: Change polling interval from 1500ms to 1000ms for smooth countdown
if (code.includes("}, 1500;\n") || code.includes("}, 1500);")) {
  // Find the specific setInterval in the polling useEffect
  const old = `    }, 1500);
    return () => clearInterval(iv);
  }, [batchStatus?.status]);`;
  const nw = `    }, 1000);
    return () => clearInterval(iv);
  }, [batchStatus?.status]);`;
  if (code.includes(old)) {
    code = code.replace(old, nw);
    fixes++;
    console.log('✅ FIX 1: Polling interval 1500→1000ms');
  } else {
    console.log('❌ FIX 1: Could not find exact polling interval pattern');
  }
}

// FIX 2: Also fetch batchStats during auto-waiting (for bottom counters)
const oldSetData = `        setBatchStatusData(d);
        if (d.status !== 'running' && d.status !== 'rolling_back' && d.status !== 'auto-waiting') {
          clearInterval(iv);
          api.getBatchStats().then(setBatchStats).catch(() => {});
        }`;
const newSetData = `        setBatchStatusData(d);
        if (d.status === 'auto-waiting' || d.status === 'completed' || d.status === 'idle' || d.status === 'auto-stopped') {
          api.getBatchStats().then(setBatchStats).catch(() => {});
        }
        if (d.status !== 'running' && d.status !== 'rolling_back' && d.status !== 'auto-waiting') {
          clearInterval(iv);
        }`;

if (code.includes(oldSetData)) {
  code = code.replace(oldSetData, newSetData);
  fixes++;
  console.log('✅ FIX 2: Stats refresh during auto-waiting + on completion');
} else {
  console.log('❌ FIX 2: Could not find setBatchStatusData pattern');
  // Debug: show what's around setBatchStatusData
  const idx = code.indexOf('setBatchStatusData(d)');
  if (idx > -1) {
    console.log('Found setBatchStatusData at char', idx);
    console.log('Context:', JSON.stringify(code.substring(idx, idx + 300)));
  }
}

fs.writeFileSync(f, code, 'utf8');
console.log(`Done. ${fixes} fixes applied. Lines: ${code.split('\n').length}`);
