#!/usr/bin/env node
// patch_css_statusfilter.js
// Добавляет CSS для кликабельной сводки + активного фильтра
// Запускать на сервере: node /var/www/amoschool/patch_css_statusfilter.js

const fs = require('fs');
const cssPath = '/var/www/amoschool/frontend/src/FieldSync.css';
let css = fs.readFileSync(cssPath, 'utf8');
let ok = 0;

// ── 1. Кликабельный fs-sum-item + hover + active ─────────────────────────────
const anchor = `.fs-sum-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 14px;
  border-radius: 8px;
  min-width: 90px;
}`;

const newItem = `.fs-sum-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 14px;
  border-radius: 8px;
  min-width: 90px;
  cursor: pointer;
  user-select: none;
  transition: transform 0.1s, box-shadow 0.15s, opacity 0.15s;
}
.fs-sum-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  opacity: 0.9;
}
.fs-sum-item:active {
  transform: translateY(0);
}
.fs-sum-active {
  outline: 2.5px solid currentColor;
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(0,0,0,0.08);
  font-weight: 700;
}`;

if (!css.includes('fs-sum-active')) {
  if (css.includes(anchor)) {
    css = css.replace(anchor, newItem);
    console.log('OK 1: .fs-sum-item кликабельный + .fs-sum-active');
    ok++;
  } else {
    console.log('FAIL 1: паттерн .fs-sum-item не найден');
  }
} else {
  console.log('SKIP 1: .fs-sum-active уже есть');
  ok++;
}

// ── 2. Кнопка "Сбросить фильтр" ──────────────────────────────────────────────
if (!css.includes('fs-sum-clear-filter')) {
  const insertAfter = `.fs-sum-skipped .fs-sum-val { color: #6b7280; }`;
  const idx = css.indexOf(insertAfter);
  if (idx >= 0) {
    const insertAt = idx + insertAfter.length;
    const addition = `

/* Кнопка сброса фильтра в сводке */
.fs-sum-clear-filter {
  align-self: center;
  padding: 4px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  color: #475569;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.fs-sum-clear-filter:hover {
  background: #f1f5f9;
  color: #1e293b;
}

/* Частичные совпадения — фиолетовый */
.fs-sum-partial { background: #ede9fe; color: #5b21b6; }
.fs-sum-partial .fs-sum-val { color: #7c3aed; }`;
    css = css.slice(0, insertAt) + addition + css.slice(insertAt);
    console.log('OK 2: .fs-sum-clear-filter + .fs-sum-partial добавлены');
    ok++;
  } else {
    console.log('FAIL 2: якорь .fs-sum-skipped .fs-sum-val не найден');
  }
} else {
  console.log('SKIP 2: .fs-sum-clear-filter уже есть');
  ok++;
}

fs.writeFileSync(cssPath, css, 'utf8');
console.log('\nГотово:', ok, '/ 2 CSS изменений применено');
