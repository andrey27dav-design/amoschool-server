#!/usr/bin/env node
// diag_jsx.js — show lines 810-830 as JSON for debugging
const fs = require('fs');
const src = fs.readFileSync('/var/www/amoschool/frontend/src/FieldSync.jsx', 'utf8');
const lines = src.split('\n');
for (let i = 810; i < 830; i++) {
  console.log(i + 1, JSON.stringify(lines[i]));
}
