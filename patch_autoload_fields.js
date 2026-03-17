/**
 * patch_autoload_fields.js
 * При открытии вкладки Поля (isActive=true) автоматически загружать анализ,
 * даже если data === null (первое открытие после перезагрузки страницы).
 */
const fs = require('fs');
const FSX = '/var/www/amoschool/frontend/src/FieldSync.jsx';

let src = fs.readFileSync(FSX, 'utf8');

// Целевая строка может быть CRLF или LF
const variants = [
  // CRLF
  `  // Авторефреш: перезагружаем анализ, если вкладка стала активной и данные уже были загружены.\r\n  // Это нужно чтобы не показывались устаревшие статусы (например, поля удалены в Kommo).\r\n  useEffect(() => {\r\n    if (isActive && data && !inProgress && !loading) {\r\n      loadAnalysis();\r\n    }\r\n  // eslint-disable-next-line react-hooks/exhaustive-deps\r\n  }, [isActive]);`,
  // LF
  `  // Авторефреш: перезагружаем анализ, если вкладка стала активной и данные уже были загружены.\n  // Это нужно чтобы не показывались устаревшие статусы (например, поля удалены в Kommo).\n  useEffect(() => {\n    if (isActive && data && !inProgress && !loading) {\n      loadAnalysis();\n    }\n  // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [isActive]);`,
];

const eol = src.includes('\r\n') ? '\r\n' : '\n';
const nl = eol;

const replacement =
  `  // Авторефреш: перезагружаем анализ при активации вкладки.${nl}` +
  `  // Если data===null (первое открытие после перезагрузки страницы) — тоже загружаем.${nl}` +
  `  useEffect(() => {${nl}` +
  `    if (isActive && !inProgress && !loading) {${nl}` +
  `      loadAnalysis();${nl}` +
  `    }${nl}` +
  `  // eslint-disable-next-line react-hooks/exhaustive-deps${nl}` +
  `  }, [isActive]);`;

let found = false;
for (const v of variants) {
  if (src.includes(v)) {
    src = src.replace(v, replacement);
    found = true;
    break;
  }
}

if (found) {
  fs.writeFileSync(FSX, src, 'utf8');
  console.log('OK   авто-загрузка при isActive (убрали data &&)');
} else {
  console.log('FAIL строка не найдена — возможно уже исправлено или текст изменился');
  // Показываем контекст для диагностики
  const lines = src.split(/\n/);
  const idx = lines.findIndex(l => l.includes('data && !inProgress'));
  if (idx >= 0) {
    console.log('Контекст вокруг строки:');
    console.log(lines.slice(Math.max(0, idx-2), idx+4).join('\n'));
  }
}
