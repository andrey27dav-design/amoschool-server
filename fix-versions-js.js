// Fix versions.js: remove broken sed line, add proper V1.6.20, restore V1.6.19
const fs = require('fs');
const filePath = '/var/www/amoschool/backend/src/versions.js';

const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Find and remove the broken sed-inserted line (line 4, index 3)
const fixedLines = lines.filter(line => {
  // Remove the malformed line inserted by sed
  return !line.includes('{ version: " V1.6.20, date: 2025-03-09, changes: [Countdown');
});

let fixed = fixedLines.join('\n');

// The sed also renamed V1.6.19 to V1.6.20 in the old entry.
// Current state: first entry says V1.6.20 with title 'Плавный обратный отсчёт...'
// That should be V1.6.19. We need to:
// 1. Restore it to V1.6.19
// 2. Add a NEW proper V1.6.20 entry before it

// Restore V1.6.19
fixed = fixed.replace(
  "version: 'V1.6.20',\n    date: '2026-03-09',\n    title: 'Плавный обратный отсчёт + мгновенный счётчик',",
  "version: 'V1.6.19',\n    date: '2026-03-09',\n    title: 'Плавный обратный отсчёт + мгновенный счётчик',"
);

// Insert V1.6.20 entry at the top of the array
fixed = fixed.replace(
  "const VERSIONS = [\n  {",
  `const VERSIONS = [
  {
    version: 'V1.6.20',
    date: '2026-03-09',
    title: 'Интервал опроса и обратный отсчёт 5 секунд',
    changes: [
      'Обратный отсчёт: обновляется каждые 5 сек (60 → 55 → 50 ...)',
      'Опрос сервера: каждые 5 сек вместо 2 — устраняет визуальное подтормаживание',
    ],
  },
  {`
);

fs.writeFileSync(filePath, fixed, 'utf8');

// Verify
const check = fs.readFileSync(filePath, 'utf8');
const hasV1620 = check.includes("version: 'V1.6.20'");
const hasV1619 = check.includes("version: 'V1.6.19'");
const hasBroken = check.includes('{ version: " V1.6.20, date: 2025-03-09');
console.log('V1.6.20 entry:', hasV1620 ? 'OK' : 'MISSING');
console.log('V1.6.19 entry:', hasV1619 ? 'OK' : 'MISSING');
console.log('Broken line:', hasBroken ? 'STILL PRESENT!' : 'REMOVED');
console.log(hasBroken ? 'FAIL' : 'SUCCESS');
