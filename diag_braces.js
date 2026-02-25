#!/usr/bin/env node
// diag_braces.js — ищем несбалансированные {} в JSX
const fs = require('fs');
const raw = fs.readFileSync('/var/www/amoschool/frontend/src/FieldSync.jsx', 'utf8');
const lines = raw.replace(/\r\n/g, '\n').split('\n');

let depth = 0;
let inString = null;
let inTemplate = 0;
let lastOpenLine = -1;

// Простой подсчет { } только вне строк/комментариев
// Анализируем с начала функции FieldSync (около строки 300)
// и до строки 823

let issues = [];
for (let li = 300; li < 823; li++) {
  const line = lines[li] || '';
  // skip JSX comments {/* ... */}
  // не делаем полный парсер — просто считаем { и }
  for (let ci = 0; ci < line.length; ci++) {
    const ch = line[ci];
    if (ch === '{') { depth++; lastOpenLine = li + 1; }
    if (ch === '}') {
      depth--;
      if (depth < 0) {
        issues.push(`Лишняя } на строке ${li + 1}: ${line.trim()}`);
        depth = 0;
      }
    }
  }
  if (li > 810 && depth !== 0) {
    // Показываем только в зоне 810+
  }
}
console.log('Итоговая глубина {} (должна быть 1 = закрывающая функцию):', depth);
console.log('Последняя открытая { на строке:', lastOpenLine);
if (issues.length) console.log('Проблемы:', issues);

// Ищем ошибку в своде — найдём все строки между 540 и 640 с { без }
let d2 = 0;
for (let li = 540; li < 640; li++) {
  const line = lines[li] || '';
  const opens = (line.match(/\{/g) || []).length;
  const closes = (line.match(/\}/g) || []).length;
  d2 += opens - closes;
  if (d2 !== 0 && li > 610) {
    console.log(`  line ${li+1} delta ${opens-closes} cumul ${d2}: ${line.trim()}`);
  }
}
console.log('Итого после строки 640:', d2);
