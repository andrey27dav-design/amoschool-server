#!/usr/bin/env node
// patch_css_statusfilter_v2.js — CRLF-safe
// node /var/www/amoschool/patch_css_statusfilter_v2.js

const fs = require('fs');
const cssPath = '/var/www/amoschool/frontend/src/FieldSync.css';
const rawCss = fs.readFileSync(cssPath, 'utf8');
const hasCRLF = rawCss.includes('\r\n');
let css = rawCss.replace(/\r\n/g, '\n');
let ok = 0;

// ── 1. cursor:pointer + hover + active на .fs-sum-item ──────────────────────
if (!css.includes('cursor: pointer')) {
  const old1 = `.fs-sum-item {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  padding: 8px 14px;\n  border-radius: 8px;\n  min-width: 90px;\n}`;
  const new1 = `.fs-sum-item {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  padding: 8px 14px;\n  border-radius: 8px;\n  min-width: 90px;\n  cursor: pointer;\n  user-select: none;\n  transition: transform 0.1s, box-shadow 0.15s, opacity 0.15s;\n}\n.fs-sum-item:hover {\n  transform: translateY(-2px);\n  box-shadow: 0 4px 12px rgba(0,0,0,0.12);\n  opacity: 0.9;\n}\n.fs-sum-item:active { transform: translateY(0); }\n.fs-sum-active {\n  outline: 2.5px solid currentColor;\n  outline-offset: 2px;\n  box-shadow: 0 0 0 4px rgba(0,0,0,0.08);\n}`;
  if (css.includes(old1)) {
    css = css.replace(old1, new1);
    console.log('OK 1: .fs-sum-item cursor+hover+.fs-sum-active добавлены');
    ok++;
  } else {
    // Попробуем regex
    const re = /\.fs-sum-item \{[^}]+\}/;
    if (re.test(css)) {
      css = css.replace(re, new1);
      console.log('OK 1 (regex): .fs-sum-item обновлён');
      ok++;
    } else {
      console.log('FAIL 1: .fs-sum-item не найден');
    }
  }
} else {
  console.log('SKIP 1: cursor уже есть');
  ok++;
}

// ── 2. .fs-sum-clear-filter ──────────────────────────────────────────────────
if (!css.includes('fs-sum-clear-filter')) {
  const anchor = '.fs-sum-skipped .fs-sum-val { color: #6b7280; }';
  const idx = css.indexOf(anchor);
  if (idx >= 0) {
    const insert = '\n\n/* Кнопка сброса фильтра в сводке */\n.fs-sum-clear-filter {\n  align-self: center;\n  padding: 4px 12px;\n  border: 1px solid #cbd5e1;\n  border-radius: 6px;\n  background: #fff;\n  color: #475569;\n  font-size: 0.8rem;\n  cursor: pointer;\n  transition: background 0.15s, color 0.15s;\n}\n.fs-sum-clear-filter:hover {\n  background: #f1f5f9;\n  color: #1e293b;\n}\n\n/* Частичные совпадения */\n.fs-sum-partial { background: #ede9fe; color: #5b21b6; }\n.fs-sum-partial .fs-sum-val { color: #7c3aed; }';
    css = css.slice(0, idx + anchor.length) + insert + css.slice(idx + anchor.length);
    console.log('OK 2: .fs-sum-clear-filter + .fs-sum-partial добавлены');
    ok++;
  } else {
    console.log('FAIL 2: якорь .fs-sum-skipped не найден');
  }
} else {
  console.log('SKIP 2: .fs-sum-clear-filter уже есть');
  ok++;
}

const out = hasCRLF ? css.replace(/\n/g, '\r\n') : css;
fs.writeFileSync(cssPath, out, 'utf8');
console.log('\nГотово:', ok, '/ 2 CSS изменений применено');
