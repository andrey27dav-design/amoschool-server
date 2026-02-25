#!/usr/bin/env node
// diag_jsx2.js — ищем символы за пределами ASCII в JSX
const fs = require('fs');
const src = fs.readFileSync('/var/www/amoschool/frontend/src/FieldSync.jsx', 'utf8');
const lines = src.split('\n');

// Строка 821 с col 10 — проверим по esbuild логике
// esbuild может считать строки иначе если есть CRLF

// Показать все строки с template literals ` в зоне 540-640
console.log('=== template literals (backtick) around summary ===');
for (let i = 540; i < 640; i++) {
  const line = lines[i] || '';
  if (line.includes('`') || line.includes('${')) {
    console.log(i + 1, JSON.stringify(line));
  }
}
