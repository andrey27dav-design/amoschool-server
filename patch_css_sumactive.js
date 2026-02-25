#!/usr/bin/env node
// patch_css_sumactive.js — добавляет .fs-sum-active и cursor на .fs-sum-item
const fs = require('fs');
const cssPath = '/var/www/amoschool/frontend/src/FieldSync.css';
const raw = fs.readFileSync(cssPath, 'utf8');
const hasCRLF = raw.includes('\r\n');
let css = raw.replace(/\r\n/g, '\n');
let ok = 0;

// 1. .fs-sum-item — добавить cursor+transition
const re1 = /(\.fs-sum-item \{[^}]+)(min-width: 90px;\n\})/;
if (!css.includes('cursor: pointer') || !css.match(re1)) {
  // Находим .fs-sum-item {...} через regex и добавляем свойства
  if (re1.test(css)) {
    css = css.replace(re1, '$1min-width: 90px;\n  cursor: pointer;\n  user-select: none;\n  transition: transform 0.1s, box-shadow 0.15s, opacity 0.15s;\n}');
    console.log('OK 1: cursor/transition в .fs-sum-item');
    ok++;
  } else {
    console.log('FAIL 1:', JSON.stringify(css.substring(css.indexOf('.fs-sum-item'), css.indexOf('.fs-sum-item') + 200)));
  }
} else {
  console.log('SKIP 1: уже есть'); ok++;
}

// 2. Добавить hover + active + .fs-sum-active ПОСЛЕ .fs-sum-item {}
if (!css.includes('fs-sum-active')) {
  const anchor = '.fs-sum-val {\n  font-size: 1.5rem;';
  const idx = css.indexOf(anchor);
  if (idx >= 0) {
    const addition = `.fs-sum-item:hover {\n  transform: translateY(-2px);\n  box-shadow: 0 4px 12px rgba(0,0,0,0.12);\n}\n.fs-sum-item:active { transform: translateY(0); }\n.fs-sum-active {\n  outline: 2.5px solid currentColor;\n  outline-offset: 2px;\n  box-shadow: 0 0 0 4px rgba(0,0,0,0.08);\n}\n\n`;
    css = css.slice(0, idx) + addition + css.slice(idx);
    console.log('OK 2: hover + .fs-sum-active добавлены');
    ok++;
  } else {
    console.log('FAIL 2: anchor .fs-sum-val не найден');
  }
} else {
  console.log('SKIP 2: .fs-sum-active уже есть'); ok++;
}

const out = hasCRLF ? css.replace(/\n/g, '\r\n') : css;
fs.writeFileSync(cssPath, out, 'utf8');
console.log('\nГотово:', ok, '/ 2');
