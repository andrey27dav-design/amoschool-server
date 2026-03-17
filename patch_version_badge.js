#!/usr/bin/env node
// patch_version_badge.js — добавить бейдж версии в левый верхний угол App.jsx
const fs = require('fs');
const path = '/var/www/amoschool/frontend/src/App.jsx';
let src = fs.readFileSync(path, 'utf8');
const crlf = src.includes('\r\n');
src = src.replace(/\r\n/g, '\n');
let ok = 0;

// 1. Добавить константу APP_VERSION перед STATUS_LABELS
const OLD1 = `const STATUS_LABELS = {`;
const NEW1 = `const APP_VERSION = 'V1.0.0';\n\nconst STATUS_LABELS = {`;
if (!src.includes('APP_VERSION')) {
  src = src.replace(OLD1, NEW1);
  ok++;
  console.log('OK 1: константа APP_VERSION добавлена');
} else {
  console.log('SKIP 1: APP_VERSION уже есть');
}

// 2. Добавить бейдж сразу после <div className="app">
const OLD2 = `    <div className="app">\n      <header className="header">`;
const NEW2 = `    <div className="app">\n      <div style={{ position: 'fixed', top: 8, left: 8, zIndex: 9999, background: 'rgba(30,30,40,0.78)', color: '#a5b4fc', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, letterSpacing: '0.05em', pointerEvents: 'none', backdropFilter: 'blur(4px)', border: '1px solid rgba(165,180,252,0.2)' }}>{APP_VERSION}</div>\n      <header className="header">`;
if (!src.includes('{APP_VERSION}')) {
  src = src.replace(OLD2, NEW2);
  ok++;
  console.log('OK 2: бейдж версии добавлен в JSX');
} else {
  console.log('SKIP 2: бейдж уже есть');
}

const out = crlf ? src.replace(/\n/g, '\r\n') : src;
fs.writeFileSync(path, out, 'utf8');
console.log(`\nГотово. Применено патчей: ${ok}`);
