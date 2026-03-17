#!/usr/bin/env node
// diag_jsx3.js — ищем 821-ю строку в LF-нормализованном файле
const fs = require('fs');
const raw = fs.readFileSync('/var/www/amoschool/frontend/src/FieldSync.jsx', 'utf8');
// esbuild читает файл как есть (CRLF)
// col 10 на строке 821
const lines = raw.split('\r\n'); // CRLF split
const line = lines[820]; // 0-indexed
console.log('line 821 (CRLF split):', JSON.stringify(line));
console.log('char 10:', JSON.stringify(line ? line[9] : '?'));

// Также ищем все template literals с незакрытым backtick
// (несчётное количество backtick)
let backtickCount = 0;
let lastBtLine = -1, lastBtCol = -1;
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  for (let j = 0; j < l.length; j++) {
    if (l[j] === '`') {
      backtickCount++;
      lastBtLine = i + 1;
      lastBtCol = j + 1;
    }
  }
}
console.log(`Total backticks: ${backtickCount} (${backtickCount % 2 === 0 ? 'OK' : 'UNPAIRED!'})`);
console.log(`Last backtick at line ${lastBtLine}, col ${lastBtCol}: ${JSON.stringify(lines[lastBtLine-1])}`);
