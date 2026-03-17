/**
 * generate_main_groups_excel.js
 * Excel: детальное сравнение полей AMO vs Kommo
 * только для групп "Основное" и "Статистика" (все сущности).
 * Цвета: зелёный = synced/matched, фиолетовый = partial, жёлтый = missing.
 */

const ExcelJS = require('exceljs');
const http = require('http');
const path = require('path');

const TARGET_GROUPS = ['основное', 'статистика', 'main', 'statistics', 'general', 'без группы'];

function fetchAnalysis() {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: 'localhost', port: 3008, path: '/api/migration/fields-analysis', method: 'GET' },
      res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

const TYPE_LABELS = {
  text: 'Текст', textarea: 'Много текста', numeric: 'Число',
  select: 'Список (один)', multiselect: 'Список (много)', radiobutton: 'Переключатель',
  checkbox: 'Флажок', date: 'Дата', date_time: 'Дата и время',
  url: 'URL', multitext: 'Телефон / Email', tracking_data: 'UTM / Трекинг',
  smart_address: 'Адрес', chained_lists: 'Связанный список', birthday: 'День рождения',
};
function tl(t) { return TYPE_LABELS[t] || t || '—'; }

// Все значения enum через перенос строки
function enumFull(field) {
  if (!field) return '—';
  const e = field.enums || [];
  if (!e.length) return '—';
  return e.map((x, i) => `${i + 1}. ${x.value}`).join('\n');
}

// Короткая сводка enum (для ячейки-заголовка)
function enumSummary(field) {
  if (!field) return '—';
  const e = field.enums || [];
  if (!e.length) return '—';
  return `${e.length} значений`;
}

// Строки, которых нет в Kommo (с учётом семантики — берём из missingEnums)
function missingEnumsFull(fp) {
  const me = fp.missingEnums || [];
  if (!me.length) return '';
  return me.map((x, i) => `${i + 1}. ${x.value}`).join('\n');
}

// Цвета фона строки по статусу
const ROW_FILL = {
  synced:    'FFD1FAE5', // зелёный
  matched:   'FFD1FAE5', // зелёный
  partial:   'FFEDE9FE', // фиолетовый
  different: 'FFFEE2E2', // красный
  missing:   'FFFEF9C3', // жёлтый
  skipped:   'FFF3F4F6', // серый
};
const ROW_FONT_COLOR = {
  synced:    'FF065F46',
  matched:   'FF065F46',
  partial:   'FF5B21B6',
  different: 'FF991B1B',
  missing:   'FF713F12',
  skipped:   'FF374151',
};
const STATUS_LABEL = {
  synced:    '✅ Совпадает',
  matched:   '🟢 Совпадает (тип ~)',
  partial:   '🟣 Частично',
  different: '🔴 Конфликт типов',
  missing:   '🟡 Нет в Kommo',
  skipped:   '⏭ Пропущено',
};
const VIA_LABELS = {
  name:        '🔑 точное имя',
  code:        '📌 по code',
  mapped:      '📋 по маппингу',
  translation: '🌐 перевод',
};

function applyBorder(cell) {
  cell.border = {
    top:    { style: 'thin',  color: { argb: 'FFD1D5DB' } },
    left:   { style: 'thin',  color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'thin',  color: { argb: 'FFD1D5DB' } },
    right:  { style: 'thin',  color: { argb: 'FFD1D5DB' } },
  };
}

function fillCell(cell, bgArgb, fontArgb, bold = false) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
  cell.font = { bold, size: 9, color: { argb: fontArgb } };
  cell.alignment = { vertical: 'top', wrapText: true };
  applyBorder(cell);
}

// ── Заголовки колонок ─────────────────────────────────────────────────────────
//  A  B        C         D       E          F       G         H       I          J         K         L
// №  Статус   Имя AMO   Тип     Вариантов  Значения  Имя Kommo  Тип     Вариантов  Значения  Найдено   Новые значения
const COLS = [
  { header: '№',               width: 4,  key: 'num' },
  { header: 'Статус',          width: 18, key: 'status' },
  { header: 'Поле AMO',        width: 26, key: 'amoName' },
  { header: 'Тип AMO',         width: 16, key: 'amoType' },
  { header: 'AMO:\nзначений',  width: 9,  key: 'amoCnt' },
  { header: 'AMO:\nВсе значения списка',  width: 30, key: 'amoVals' },
  { header: 'Поле Kommo',      width: 26, key: 'kName' },
  { header: 'Тип Kommo',       width: 16, key: 'kType' },
  { header: 'Kommo:\nзначений',width: 9,  key: 'kCnt' },
  { header: 'Kommo:\nВсе значения списка', width: 30, key: 'kVals' },
  { header: 'Как\nнайдено',    width: 14, key: 'via' },
  { header: '➕ Добавить в Kommo\n(значений нет)',  width: 30, key: 'missing' },
];

function buildSheet(wb, sheetName, tabColor, entityLabel, groups) {
  const ws = wb.addWorksheet(sheetName, { tabColor: { argb: tabColor } });
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];

  // Строка 1: заголовок сущности
  ws.mergeCells(`A1:L1`);
  const t = ws.getCell('A1');
  t.value = `${entityLabel}  —  группы: Основное / Статистика`;
  t.font = { bold: true, size: 14, color: { argb: 'FF1E3A5F' } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0ECF8' } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  // Строка 2: легенда
  ws.mergeCells('A2:L2');
  const leg = ws.getCell('A2');
  leg.value =
    '✅ Зелёный = поля полностью совпадают     ' +
    '🟣 Фиолетовый = частичное совпадение (не все значения списка есть в Kommo)     ' +
    '🟡 Жёлтый = поле отсутствует в Kommo';
  leg.font = { size: 9, italic: true, color: { argb: 'FF374151' } };
  leg.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
  leg.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(2).height = 20;

  // Строка 3: заголовки колонок
  ws.columns = COLS.map(c => ({ width: c.width }));
  const hdr = ws.getRow(3);
  COLS.forEach((c, i) => {
    const cell = hdr.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FF9CA3AF' } },
      right:  { style: 'thin',   color: { argb: 'FF6B7280' } },
    };
  });
  hdr.height = 36;

  let rowIdx = 4;
  let fieldNum = 0;
  let prevGroup = null;

  groups.forEach(g => {
    // Строка-разделитель группы
    if (g.name !== prevGroup) {
      prevGroup = g.name;
      ws.mergeCells(`A${rowIdx}:L${rowIdx}`);
      const gc = ws.getCell(`A${rowIdx}`);
      gc.value = `  📁  ${g.name}`;
      gc.font = { bold: true, italic: true, size: 10, color: { argb: 'FF1E3A5F' } };
      gc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
      gc.border = { bottom: { style: 'medium', color: { argb: 'FF9CA3AF' } } };
      ws.getRow(rowIdx).height = 22;
      rowIdx++;
    }

    g.fields.forEach(fp => {
      fieldNum++;
      const s = fp.status;
      const bg = ROW_FILL[s] || 'FFFFFFFF';
      const fc = ROW_FONT_COLOR[s] || 'FF374151';
      const row = ws.getRow(rowIdx);

      const amoEnumCount = (fp.amo?.enums || []).length;
      const kEnumCount   = (fp.kommo?.enums || []).length;
      const missingCount = (fp.missingEnums || []).length;

      const vals = [
        fieldNum,
        STATUS_LABEL[s] || s,
        fp.amo?.name  || '—',
        tl(fp.amo?.type),
        amoEnumCount || (fp.amo ? '—' : ''),
        enumFull(fp.amo),
        fp.kommo?.name || '—',
        tl(fp.kommo?.type),
        kEnumCount   || (fp.kommo ? '—' : ''),
        enumFull(fp.kommo),
        VIA_LABELS[fp.matchedVia] || (fp.kommo ? '🔑 точное имя' : ''),
        missingEnumsFull(fp),
      ];

      vals.forEach((v, ci) => {
        const cell = row.getCell(ci + 1);
        cell.value = v === '' ? '' : (v === 0 ? '' : v);

        // Статус — жирный, цветной
        if (ci === 1) {
          fillCell(cell, bg, fc, true);
        } else if (ci === 11 && missingCount > 0) {
          // Колонка "добавить" — фиолетовый если есть что добавлять
          fillCell(cell, 'FFEDE9FE', 'FF5B21B6', false);
        } else {
          fillCell(cell, bg, fc, false);
        }
      });

      // Автовысота строки: рассчитываем по максимальному числу переносов
      const maxLines = Math.max(
        amoEnumCount, kEnumCount, missingCount, 1
      );
      row.height = Math.min(Math.max(maxLines * 14, 18), 300);

      // Жирный шрифт для имён полей
      row.getCell(3).font = { bold: true, size: 9, color: { argb: fc } };
      row.getCell(7).font = { bold: true, size: 9, color: { argb: fc } };
      ['3','7'].forEach(col => {
        const c = row.getCell(parseInt(col));
        c.border = {
          top:    { style: 'thin',  color: { argb: 'FFD1D5DB' } },
          left:   { style: 'thin',  color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin',  color: { argb: 'FFD1D5DB' } },
          right:  { style: 'thin',  color: { argb: 'FFD1D5DB' } },
        };
      });

      rowIdx++;
    });
  });

  // Итоговая строка
  const totRow = ws.getRow(rowIdx);
  ws.mergeCells(`A${rowIdx}:B${rowIdx}`);
  totRow.getCell(1).value = `Итого полей: ${fieldNum}`;
  totRow.getCell(1).font = { bold: true, size: 10, color: { argb: 'FF1E3A5F' } };
  totRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0ECF8' } };
  ws.getRow(rowIdx).height = 20;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log('Запрашиваем fields-analysis...');
  const analysis = await fetchAnalysis();
  if (analysis.error) { console.error('API error:', analysis.error); process.exit(1); }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'AMO→Kommo Migration';
  wb.created = new Date();

  const entityConfig = [
    { key: 'leads',     label: '📋 Сделки',   sheetName: 'Сделки',   color: 'FF0F7038' },
    { key: 'contacts',  label: '👤 Контакты', sheetName: 'Контакты', color: 'FF6D28D9' },
    { key: 'companies', label: '🏢 Компании', sheetName: 'Компании', color: 'FF92400E' },
  ];

  let totalFiltered = 0;

  for (const ec of entityConfig) {
    const entityData = analysis.entities?.[ec.key];
    if (!entityData) continue;

    // Фильтруем только группы Основное / Статистика
    const filteredGroups = (entityData.groups || []).filter(g => {
      const n = (g.name || '').toLowerCase().trim();
      return TARGET_GROUPS.some(t => n === t || n.startsWith(t));
    });

    if (!filteredGroups.length) {
      console.log(`  ${ec.label}: нет целевых групп`);
      continue;
    }

    // Преобразуем fields в нужный формат (добавляем groupName)
    const groupsForSheet = filteredGroups.map(g => ({
      name: g.name,
      fields: (g.fields || []),
    }));

    const cnt = groupsForSheet.reduce((s, g) => s + g.fields.length, 0);
    totalFiltered += cnt;
    console.log(`  ${ec.label}: ${filteredGroups.length} групп, ${cnt} полей`);

    buildSheet(wb, ec.sheetName, ec.color, ec.label, groupsForSheet);
  }

  if (totalFiltered === 0) {
    console.log('⚠ Нет полей в группах Основное/Статистика — проверьте названия групп');
    // fallback: выводим все группы
    console.log('Доступные группы:');
    for (const ec of entityConfig) {
      const entityData = analysis.entities?.[ec.key];
      if (!entityData) continue;
      (entityData.groups || []).forEach(g => console.log(`  [${ec.key}] "${g.name}"`));
    }
    process.exit(1);
  }

  const outPath = '/tmp/field_mapping_main_groups.xlsx';
  await wb.xlsx.writeFile(outPath);
  console.log(`\n✅ Excel сохранён: ${outPath}  (${totalFiltered} полей)`);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
