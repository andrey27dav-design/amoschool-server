/**
 * Patch script for App.jsx — adds CopyDeals tab without using sed.
 * Run on server: node patch-app.js
 */
const fs = require('fs');
const path = require('path');

const APP_PATH = path.join(__dirname, 'App.jsx');
let content = fs.readFileSync(APP_PATH, 'utf8');

let changed = 0;

// 1. Add CopyDeals import after FieldSync import
const importTarget = "import FieldSync from './FieldSync';";
const importReplacement = "import FieldSync from './FieldSync';\nimport CopyDeals from './CopyDeals';";
if (content.includes(importTarget) && !content.includes("import CopyDeals")) {
  content = content.replace(importTarget, importReplacement);
  changed++;
  console.log('✓ Added CopyDeals import');
} else {
  console.log('- CopyDeals import already present or FieldSync not found');
}

// 2. Add 'copy' to tabs array
const tabsArray = "['dashboard', 'data', 'pipelines', 'fields', 'backups']";
const tabsArrayNew = "['dashboard', 'data', 'pipelines', 'fields', 'copy', 'backups']";
if (content.includes(tabsArray)) {
  content = content.replace(tabsArray, tabsArrayNew);
  changed++;
  console.log('✓ Added copy to tabs array');
} else {
  console.log('- tabs array not found or already has copy');
}

// 3. Add copy tab label — find the backups label and prepend copy label before it
// Matches: : '💾 Бэкапы'  (the last ternary branch)
// We need to add : t === 'copy' ? '🚀 Копирование' before the backups one
// Use a regex that finds the last ternary in the tabs label string
const backupsLabel = /: '[\u{1F4BE}💾].*?'\}/u;
const backupsLabelSimple = ": '\ud83d\udcbe \u0411\u044d\u043a\u0430\u043f\u044b'}";
if (content.includes(backupsLabelSimple)) {
  content = content.replace(
    backupsLabelSimple,
    ": t === 'copy' ? '\ud83d\ude80 \u041a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435' : '\ud83d\udcbe \u0411\u044d\u043a\u0430\u043f\u044b'}"
  );
  changed++;
  console.log('✓ Added copy tab label');
} else {
  console.log('- backups label not found (trying alternative)');
  // Try to find by ASCII-safe part
  const idx = content.indexOf("'backups'");
  if (idx !== -1) {
    // Find the surrounding ternary structure — look for pattern ending with backups label
    const snippet = content.substring(idx - 5, idx + 100);
    console.log('  Context around backups:', JSON.stringify(snippet));
  }
}

// 4. Add CopyDeals tab render before backups section
const backupsSection = "\n      {tab === 'backups' && (";
const copySection = "\n\n      {tab === 'copy' && (\n        <CopyDeals />\n      )}" + backupsSection;
if (content.includes(backupsSection) && !content.includes("tab === 'copy'")) {
  content = content.replace(backupsSection, copySection);
  changed++;
  console.log('✓ Added CopyDeals tab render section');
} else {
  console.log('- backups section not found or copy section already present');
}

if (changed > 0) {
  // Backup original
  fs.writeFileSync(APP_PATH + '.bak', fs.readFileSync(APP_PATH));
  fs.writeFileSync(APP_PATH, content, 'utf8');
  console.log(`\n✅ App.jsx patched successfully (${changed} changes). Backup saved as App.jsx.bak`);
} else {
  console.log('\n⚠️  No changes made to App.jsx');
}
