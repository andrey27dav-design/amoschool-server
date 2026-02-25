#!/usr/bin/env node
// fix_pipeline_name_color.js
const fs = require('fs');
const path = '/var/www/amoschool/frontend/src/App.jsx';
let raw = fs.readFileSync(path, 'utf8');
const crlf = raw.includes('\r\n');
let src = raw.replace(/\r\n/g, '\n');

let count = 0;
const OLD = `<span style={{ fontWeight: 600 }}>{p.name}</span>`;
const NEW = `<span style={{ fontWeight: 700, color: '#111827' }}>{p.name}</span>`;

while (src.includes(OLD)) {
  src = src.replace(OLD, NEW);
  count++;
}

if (count > 0) {
  const out = crlf ? src.replace(/\n/g, '\r\n') : src;
  fs.writeFileSync(path, out, 'utf8');
  console.log(`OK: заменено ${count} вхождений — цвет названий воронок #111827 (чёрный), bold 700`);
} else {
  console.log('FAIL: шаблон не найден');
  process.exit(1);
}
