// Fix V1.6.20: Change countdown display and poll to every 5 seconds
const fs = require('fs');
const path = '/var/www/amoschool/frontend/src/App.jsx';

let code = fs.readFileSync(path, 'utf8');
const original = code;

// 1. Client-side countdown: 1000ms interval, -1 decrement → 5000ms interval, -5 decrement
code = code.replace(
  /setBatchStatusData\(prev => \{\s*if \(!prev \|\| prev\.status !== 'auto-waiting' \|\| !prev\.autoRunCountdown \|\| prev\.autoRunCountdown <= 0\) return prev;\s*return \{ \.\.\.prev, autoRunCountdown: prev\.autoRunCountdown - 1 \};/,
  `setBatchStatusData(prev => {
          if (!prev || prev.status !== 'auto-waiting' || !prev.autoRunCountdown || prev.autoRunCountdown <= 0) return prev;
          return { ...prev, autoRunCountdown: prev.autoRunCountdown - 5 };`
);

// Change countdown setInterval from 1000 to 5000
code = code.replace(
  /}, 1000\);\s*\}\s*\/\/ Server poll every 2s/,
  `}, 5000);
    }

    // Server poll every 5s`
);

// 2. Server poll: 2000ms → 5000ms
code = code.replace(
  /\/\/ Wait 2s between polls\s*await new Promise\(r => setTimeout\(r, 2000\)\);/,
  `// Wait 5s between polls
        await new Promise(r => setTimeout(r, 5000));`
);

if (code === original) {
  console.log('ERROR: No changes made!');
  process.exit(1);
}

fs.writeFileSync(path, code, 'utf8');
console.log('OK: countdown display 5s, poll 5s');
