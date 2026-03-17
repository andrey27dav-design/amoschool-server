/**
 * generate_field_mapping_excel.js
 * Генерирует Excel-файл с анализом сопоставления полей AMO → Kommo для подтверждения заказчиком.
 */

const ExcelJS = require('exceljs');
const http = require('http');
const path = require('path');

// ── Получаем результаты fields-analysis через локальный API ─────────────────
function fetchAnalysis() {
  return new Promise((resolve, reject) => {
    const options = { hostname: 'localhost', port: 3008, path: '/api/migration/fields-analysis', method: 'GET' };
    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Parse error: ' + e.message + '\nData: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ── Цвета и стили ─────────────────────────────────────────────────────────────
const STATUS_META = {
  synced:    { label: '✅ Синхронизировано', fill: 'FFDBEAFE', font: 'FF1E40AF' },
  matched:   { label: '🟢 Совпадает',        fill: 'FFDCFCE7', font: 'FF166534' },
  partial:   { label: '🟣 Частично',         fill: 'FFEDE9FE', font: 'FF6D28D9' },
  different: { label: '🔴 Отличается',       fill: 'FFFEE2E2', font: 'FF991B1B' },
  missing:   { label: '🟡 Нет в Kommo',      fill: 'FFFEF9C3', font: 'FF713F12' },
  skipped:   { label: '⏭ Пропущено',        fill: 'FFF3F4F6', font: 'FF374151' },
};

const TYPE_LABELS = {
  text: 'Текст', textarea: 'Текст (много)', numeric: 'Число',
  select: 'Список', multiselect: 'Мультисписок', radiobutton: 'Переключатель',
  checkbox: 'Флажок', date: 'Дата', date_time: 'Дата и время',
  url: 'URL', multitext: 'Тел/Email', tracking_data: 'UTM/Трекинг',
  smart_address: 'Адрес', chained_lists: 'Связанный список', birthday: 'День рождения',
};

function typeLbl(t) { return TYPE_LABELS[t] || t || '—'; }

function enumsStr(field) {
  if (!field) return '—';
  const e = field.enums || [];
  if (!e.length) return '—';
  const vals = e.map(x => x.value).filter(Boolean);
  if (vals.length <= 6) return vals.join(', ');
  return vals.slice(0, 5).join(', ') + ` ... (+${vals.length - 5})`;
}

function actionText(fp) {
  if (fp.status === 'synced') return 'Уже совпадает — ничего не нужно';
  if (fp.status === 'skipped') return 'Пропускается';
  if (fp.status === 'matched') {
    const diffs = (fp.differences || []);
    if (diffs.includes('type')) return `Совпадает по смыслу, тип отличается (AMO: ${typeLbl(fp.amo?.type)}, Kommo: ${typeLbl(fp.kommo?.type)})`;
    return 'Совпадает — ничего не нужно';
  }
  if (fp.status === 'partial') {
    const cnt = fp.missingCount || (fp.missingEnums || []).length;
    return `Добавить ${cnt} значений в список Kommo`;
  }
  if (fp.status === 'different') return 'Поле есть, но тип/структура отличается';
  if (fp.status === 'missing') {
    if (fp.kommo) return `Создать новое поле (конфликт типа: Kommo имеет "${typeLbl(fp.kommo.type)}")`;
    return 'Поле отсутствует в Kommo — будет создано';
  }
  return '—';
}

function missingEnumsStr(fp) {
  if (fp.status !== 'partial') return '';
  const enums = fp.missingEnums || [];
  if (!enums.length) return '';
  const vals = enums.map(e => e.value).filter(Boolean);
  if (vals.length <= 8) return vals.join(', ');
  return vals.slice(0, 7).join(', ') + ` ... (+${vals.length - 7})`;
}

// ── Заголовок листа ───────────────────────────────────────────────────────────
const VIA_LABELS = {
  name:        '🔐 Точное имя',
  code:        '📌 По code',
  mapped:      '📑 По маппингу',
  translation: '🔤 Перевод',
  partial:     '🔍 Похожее',
};

function setupEntitySheet(ws, entityName, fieldPairs) {
  // Freeze header
  ws.views = [{ state: 'frozen', ySplit: 3 }];

  // ── Строка 1: заголовок блока ───────────────────────────────────────────────
  ws.mergeCells('A1:M1');
  const titleCell = ws.getCell('A1');
  titleCell.value = `Сопоставление полей — ${entityName}   (всего: ${fieldPairs.length})`;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FF1E3A5F' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0ECF8' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  // ── Строка 2: заголовок AMO / Kommo ────────────────────────────────────────
  ws.mergeCells('A2:B2'); ws.getCell('A2').value = '';
  ws.mergeCells('C2:F2');
  const amoHdr = ws.getCell('C2');
  amoHdr.value = '◀  AMO CRM';
  amoHdr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  amoHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B6FCA' } };
  amoHdr.alignment = { horizontal: 'center' };

  ws.mergeCells('G2:J2');
  const kommoHdr = ws.getCell('G2');
  kommoHdr.value = 'Kommo CRM  ▶';
  kommoHdr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  kommoHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F7038' } };
  kommoHdr.alignment = { horizontal: 'center' };

  ws.mergeCells('K2:L2');
  const actHdr = ws.getCell('K2');
  actHdr.value = 'Действие при миграции';
  actHdr.font = { bold: true, color: { argb: 'FF374151' } };
  actHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  actHdr.alignment = { horizontal: 'center' };

  ws.getCell('M2').value = '';

  ws.getRow(2).height = 22;

  // ── Строка 3: колонки ──────────────────────────────────────────────────────
  const headers = [
    '№', 'Статус',
    'Поле AMO', 'Тип AMO', 'Значения AMO (список)', 'Группа AMO',
    'Поле Kommo', 'Тип Kommo', 'Значения Kommo (список)', 'Как найдено',
    'Что будет сделано', 'Добавляемые значения',
    'Подтверждение заказчика ✏',
  ];
  const hdrRow = ws.getRow(3);
  headers.forEach((h, i) => {
    const cell = hdrRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10, color: { argb: 'FF1F2937' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1D5DB' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FF9CA3AF' } },
      right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    };
  });
  hdrRow.height = 38;

  // Ширины колонок
  ws.columns = [
    { width: 5 },   // №
    { width: 18 },  // статус
    { width: 28 },  // поле AMO
    { width: 14 },  // тип AMO
    { width: 34 },  // значения AMO
    { width: 18 },  // группа AMO
    { width: 28 },  // поле Kommo
    { width: 14 },  // тип Kommo
    { width: 34 },  // значения Kommo
    { width: 16 },  // как найдено
    { width: 36 },  // действие
    { width: 36 },  // добавляемые значения
    { width: 28 },  // подтверждение
  ];

  // ── Данные ─────────────────────────────────────────────────────────────────
  let rowNum = 4;
  let prevGroup = null;

  fieldPairs.forEach((fp, idx) => {
    // Разделитель группы
    if (fp.groupName !== prevGroup) {
      prevGroup = fp.groupName;
      const grpRow = ws.getRow(rowNum++);
      ws.mergeCells(`A${grpRow.number}:M${grpRow.number}`);
      const gc = grpRow.getCell(1);
      gc.value = `  📁  ${fp.groupName || 'Основное'}`;
      gc.font = { bold: true, italic: true, size: 10, color: { argb: 'FF374151' } };
      gc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
      grpRow.height = 20;
    }

    const meta = STATUS_META[fp.status] || STATUS_META.missing;
    const row = ws.getRow(rowNum++);

    const vals = [
      idx + 1,
      meta.label,
      fp.amo?.name || '—',
      typeLbl(fp.amo?.type),
      enumsStr(fp.amo),
      fp.groupName || '—',
      fp.kommo?.name || '—',
      typeLbl(fp.kommo?.type),
      enumsStr(fp.kommo),
      VIA_LABELS[fp.matchedVia] || (fp.kommo ? '🔐 По имени' : '—'),
      actionText(fp),
      missingEnumsStr(fp),
      '',  // подтверждение заказчика — пустое
    ];

    vals.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: meta.fill } };
      cell.font = { size: 9, color: { argb: ci === 1 ? meta.font : 'FF1F2937' } };
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } }, right: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
      cell.alignment = { vertical: 'top', wrapText: true };
      if (ci === 1) cell.font = { bold: true, size: 9, color: { argb: meta.font } };
    });

    // Подсветить жёлтую колонку подтверждения
    const confCell = row.getCell(13);
    confCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
    confCell.border = {
      bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } },
      right: { style: 'medium', color: { argb: 'FFFBBF24' } },
      left: { style: 'medium', color: { argb: 'FFFBBF24' } },
    };
    row.height = 20;
  });
}

// ── Лист "Сводка" ─────────────────────────────────────────────────────────────
function setupSummarySheet(ws, analysis) {
  ws.views = [{ state: 'frozen', ySplit: 4 }];
  ws.columns = [{ width: 30 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 40 }];

  ws.mergeCells('A1:E1');
  const title = ws.getCell('A1');
  title.value = 'Анализ сопоставления полей AMO CRM → Kommo CRM';
  title.font = { bold: true, size: 16, color: { argb: 'FF1E3A5F' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0ECF8' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 36;

  ws.mergeCells('A2:E2');
  ws.getCell('A2').value = `Дата формирования: ${new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })}`;
  ws.getCell('A2').font = { size: 11, italic: true, color: { argb: 'FF6B7280' } };
  ws.getCell('A2').alignment = { horizontal: 'center' };
  ws.getRow(2).height = 22;

  // Подзаголовок таблицы сводки
  const hdr = ws.getRow(4);
  ['Сущность / Статус', 'Сделки', 'Контакты', 'Компании', 'Описание'].forEach((h, i) => {
    const c = hdr.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = { bottom: { style: 'medium', color: { argb: 'FF9CA3AF' } } };
  });
  ws.getRow(4).height = 26;

  // Считаем статистику из entities
  const entities = ['leads', 'contacts', 'companies'];
  const entityLabels = { leads: 'Сделки', contacts: 'Контакты', companies: 'Компании' };
  const stats = {};
  const statuses = ['synced', 'matched', 'partial', 'different', 'missing', 'skipped'];

  entities.forEach(e => {
    stats[e] = { total: 0, synced: 0, matched: 0, partial: 0, different: 0, missing: 0, skipped: 0 };
    const entityData = analysis.entities && analysis.entities[e];
    if (!entityData) return;
    (entityData.groups || []).forEach(g => {
      (g.fields || []).forEach(fp => {
        stats[e].total++;
        stats[e][fp.status] = (stats[e][fp.status] || 0) + 1;
      });
    });
  });

  const statusDescriptions = {
    total:     'Всего полей AMO',
    synced:    '✅ Полное совпадение — поле уже есть в Kommo, ничего делать не нужно',
    matched:   '🟢 Поля совпадают по назначению, возможны небольшие технические отличия',
    partial:   '🟣 В Kommo есть аналог, но не все значения списка присутствуют — нужно добавить',
    different: '🔴 Поля есть в обоих системах, но тип данных принципиально отличается',
    missing:   '🟡 Поля нет в Kommo — будет создано новое',
    skipped:   '⏭ Поле пропущено (помечено как не требующее переноса)',
  };

  const statusMetas = { ...STATUS_META, total: { fill: 'FFEFF6FF', font: 'FF1E3A5F' } };

  let r = 5;
  ['total', ...statuses].forEach(s => {
    const row = ws.getRow(r++);
    const meta = statusMetas[s] || { fill: 'FFFFFFFF', font: 'FF374151' };
    const cells = [
      statusDescriptions[s] || s,
      stats.leads[s] || 0,
      stats.contacts[s] || 0,
      stats.companies[s] || 0,
      '',
    ];
    cells.forEach((v, i) => {
      const c = row.getCell(i + 1);
      c.value = v;
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: meta.fill } };
      c.font = { bold: s === 'total', size: 10, color: { argb: meta.font } };
      c.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
      c.alignment = i === 0 ? { vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
    });
    if (s === 'total') row.height = 22;
    else row.height = 18;
  });

  // Легенда
  ws.getRow(r + 1).getCell(1).value = '';
  ws.getRow(r + 2).getCell(1).value = 'Инструкция для заказчика:';
  ws.getRow(r + 2).getCell(1).font = { bold: true, size: 11 };

  const instructions = [
    '1. Просмотрите листы "Сделки", "Контакты", "Компании" — каждый содержит таблицу всех полей.',
    '2. В последней колонке "Подтверждение заказчика" напишите своё решение:',
    '   • "ОК" — согласен с предложенным действием',
    '   • "Пропустить" — это поле не нужно переносить',
    '   • Любой комментарий / уточнение',
    '3. Особое внимание на строки 🟡 Нет в Kommo — там будут создаваться новые поля.',
    '4. Строки 🟣 Частично — в существующий список Kommo будут добавлены значения из AMO (указаны в колонке "Добавляемые значения").',
    '5. Строки ✅ Синхронизировано — уже всё ок, никаких изменений не требуется.',
  ];
  instructions.forEach((txt, i) => {
    const instrRow = ws.getRow(r + 3 + i);
    ws.mergeCells(`A${instrRow.number}:E${instrRow.number}`);
    instrRow.getCell(1).value = txt;
    instrRow.getCell(1).font = { size: 10, color: { argb: 'FF374151' } };
    instrRow.height = 18;
  });
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log('Запрашиваем fields-analysis...');
  const analysis = await fetchAnalysis();

  if (analysis.error) {
    console.error('Ошибка API:', analysis.error);
    process.exit(1);
  }

  console.log('Данные получены. Формируем Excel...');

  const wb = new ExcelJS.Workbook();
  wb.creator = 'AMO→Kommo Migration Tool';
  wb.created = new Date();

  // Сводка
  const summaryWs = wb.addWorksheet('📊 Сводка', { tabColor: { argb: 'FF1E40AF' } });
  setupSummarySheet(summaryWs, analysis);

  // Листы по сущностям
  const entityConfig = [
    { key: 'leads',     name: '📋 Сделки',   color: 'FF0F7038' },
    { key: 'contacts',  name: '👤 Контакты', color: 'FF6D28D9' },
    { key: 'companies', name: '🏢 Компании', color: 'FF92400E' },
  ];

  for (const ec of entityConfig) {
    const entityData = analysis.entities && analysis.entities[ec.key];
    if (!entityData) continue;
    const ws = wb.addWorksheet(ec.name, { tabColor: { argb: ec.color } });

    // Собираем все fields с добавлением groupName
    const allPairs = [];
    (entityData.groups || []).forEach(g => {
      (g.fields || []).forEach(fp => {
        allPairs.push({ ...fp, groupName: g.name, kommoGroupName: g.kommoGroupId ? g.name : null });
      });
    });

    setupEntitySheet(ws, ec.name.replace(/^[^\s]+\s/, ''), allPairs);
    console.log(`  ${ec.name}: ${allPairs.length} полей`);
  }

  const outPath = path.resolve('/tmp/field_mapping_client_review.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log(`\n✅ Excel сохранён: ${outPath}`);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
