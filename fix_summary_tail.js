#!/usr/bin/env node
// fix_summary_tail.js — удаляет двойной хвост summary (остаток от regex-замены)
const fs = require('fs');
const raw = fs.readFileSync('/var/www/amoschool/frontend/src/FieldSync.jsx', 'utf8');
const hasCRLF = raw.includes('\r\n');
let src = raw.replace(/\r\n/g, '\n');

// Ищем дублирующийся хвост — это фрагмент от старой summary оставшийся после regex замены
const dupTail = `          {summary.skipped > 0 && (
            <div className="fs-sum-item fs-sum-skipped">
              <span className="fs-sum-val">{summary.skipped}</span>
              <span className="fs-sum-lbl">⏭ Пропущено</span>
            </div>
          )}
        </div>
      )}`;

if (src.includes(dupTail)) {
  src = src.replace(dupTail, '');
  console.log('OK: дублирующийся хвост summary удалён');
} else {
  // Попробуем найти двойной )} }} ситуацию
  // Ищем: после </div>\n      )}\n (конец нашего нового summary)
  // сразу идёт ещё старый блок
  const marker = `          )}\n        </div>\n      )}\n          {summary.skipped`;
  if (src.includes(marker)) {
    // найти начало дубля
    const idx = src.indexOf(`          {summary.skipped > 0 && (\n            <div className="fs-sum-item fs-sum-skipped">`);
    // Должно быть два вхождения — второе и есть лишнее
    const first = src.indexOf(`{summary.skipped > 0 &&`);
    const second = src.indexOf(`{summary.skipped > 0 &&`, first + 10);
    if (second >= 0) {
      // найти конец второго блока
      const endMarker = `        </div>\n      )}`;
      const endIdx = src.indexOf(endMarker, second);
      if (endIdx >= 0) {
        src = src.slice(0, second) + src.slice(endIdx + endMarker.length);
        console.log('OK (fallback): дублирующийся хвост удалён по second occurrence');
      } else {
        console.log('FAIL: конец второго блока не найден');
      }
    } else {
      console.log('FAIL: второго вхождения summary.skipped нет');
    }
  } else {
    console.log('FAIL: дублирующийся хвост не найден');
    // Диагностика
    const idx = src.indexOf('Пропущено');
    while (idx >= 0) {
      const next = src.indexOf('Пропущено', idx + 1);
      console.log('Первое "Пропущено" на позиции', src.substring(0, idx).split('\n').length);
      if (next >= 0) console.log('Второе "Пропущено" на позиции', src.substring(0, next).split('\n').length);
      break;
    }
  }
}

const out = hasCRLF ? src.replace(/\n/g, '\r\n') : src;
fs.writeFileSync('/var/www/amoschool/frontend/src/FieldSync.jsx', out, 'utf8');
console.log('Готово');
