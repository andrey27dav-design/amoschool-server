/**
 * generate_main_paired_excel.js
 * Сводная таблица полей: группа "Основное" (amo) vs "Main" (kommo)
 * Списочные поля: каждое значение — отдельная строка, совпадающие напротив.
 * Цвета строк:
 *   Зелёный  — поле/значение полностью совпадает
 *   Фиолетовый — поле частично совпадает (не все значения есть в Kommo)
 *   Жёлтый   — поля нет в Kommo / значение списка отсутствует в Kommo
 *   Синий (светлый) — значение есть в Kommo, нет в AMO (лишнее)
 */
'use strict';
const ExcelJS = require('exceljs');
const http    = require('http');

// ── Целевые группы ────────────────────────────────────────────────────────────
const TARGET_GROUPS = ['основное', 'main', 'general', 'без группы', 'основная'];

// ── Переводы для сопоставления значений (рус ↔ eng) ──────────────────────────
// Все пары добавлены в обе стороны для надёжного поиска
const TRANSLATIONS = {
  // Общие
  'телефон':'phone','phone':'телефон',
  'почта':'email','email':'почта',
  'да':'yes','yes':'да',
  'нет':'no','no':'нет',
  'другое':'other','другая':'other','other':'другое',
  'активный':'active','active':'активный',
  'неактивный':'inactive','inactive':'неактивный',
  'новый':'new','new':'новый',
  'в работе':'in progress','in progress':'в работе',
  'завершён':'completed','completed':'завершён',
  'закрыт':'closed','closed':'закрыт',
  'менеджер':'manager','manager':'менеджер',
  'директор':'director','director':'директор',
  'корпоративный':'corporate','corporate':'корпоративный',
  'физическое лицо':'individual','individual':'физическое лицо',
  'юридическое лицо':'legal entity','legal entity':'юридическое лицо',
  'рубли':'rub','rub':'рубли',
  'доллары':'usd','usd':'доллары',
  'евро':'eur','eur':'евро',
  'сайт':'website','website':'сайт',
  'telegram':'telegram','whatsapp':'whatsapp','instagram':'instagram',
  'facebook':'facebook','вконтакте':'vkontakte','vkontakte':'вконтакте',
  'сезон':'season','season':'сезон',
  'лето':'summer','summer':'лето',
  'зима':'winter','winter':'зима',
  'весна':'spring','spring':'весна',
  'осень':'autumn','autumn':'осень',

  // Пол (контакты)
  'м':'male','ж':'female',
  'мужской':'male','male':'мужской',
  'женский':'female','female':'женский',

  // Роль контакта
  'мама':'mother','mother':'мама',
  'папа':'father','father':'папа',
  'бабушка':'grandmother','grandmother':'бабушка',
  'дедушка':'grandfather','grandfather':'дедушка',
  'няня':'nanny','nanny':'няня',
  // "ребенок" в контексте роли = "student himself" (подбирается через обратный перевод)
  'student himself':'ребенок',

  // Причина закрытия
  'слишком дорого':'too expensive','too expensive':'слишком дорого',
  'не устроили условия':'the terms were not acceptable',
  'the terms were not acceptable':'не устроили условия',
  'выбрали других':'chose others','chose others':'выбрали других',
  'нет подходящей услуги':'there is no suitable product',
  'there is no suitable product':'нет подходящей услуги',
  'нет ответа':'no answer','no answer':'нет ответа',
  'негатив, не звонить':'negative feedback, do not call',
  'negative feedback, do not call':'негатив, не звонить',
  'работа, сотрудничество, спам':'spam','spam':'работа, сотрудничество, спам',
  'текущий ученик':'current student','current student':'текущий ученик',
  'дубль':'duplicate','duplicate':'дубль',
  // "ребенок" в контексте причины закрытия = "infant"
  'ребенок':'infant','infant':'ребенок',
  'не оставляли заявку':'did not submit an application',
  'did not submit an application':'не оставляли заявку',
  'это организация':'this is an organisation',
  'this is an organisation':'это организация',
  'пропала потребность':'the need disappeared',

  // Источник
  'с сайта':'landing','landing':'с сайта',
  'рекомендация':'recommendation','recommendation':'рекомендация',
  'текущий клиент':'recommendation',
  'блогер':'blogger','blogger':'блогер',

  // Продукт
  'школа рф':'school','международная школа':'school',
  'репетиторство рф':'tutoring','репетиторство мш':'tutoring',
  'tutoring':'репетиторство','school':'школа',

  // Связаться (месяцы рус→eng)
  'январь':'january','january':'январь',
  'февраль':'february','february':'февраль',
  'март':'march','march':'март',
  'апрель':'april','april':'апрель',
  'май':'may','may':'май',
  'июнь':'june','june':'июнь',
  'июль':'july','july':'июль',
  'август':'august','august':'август',
  'сентябрь':'september','september':'сентябрь',
  'октябрь':'october','october':'октябрь',
  'ноябрь':'november','november':'ноябрь',
  'декабрь':'december','december':'декабрь',
};

function norm(s) {
  return (s || '').toLowerCase().trim()
    .replace(/[«»""'']/g, '')
    .replace(/\s+/g, ' ');
}

// Попытки найти совпадение между AMO-значением и массивом Kommo-значений
function findMatchingKommoEnum(amoVal, kommoEnums, usedKommoIds) {
  const an = norm(amoVal);
  const trans = TRANSLATIONS[an] ? norm(TRANSLATIONS[an]) : null;

  // Проход 1: точное совпадение (рус↔рус или eng↔eng) или точное совпадение перевода
  for (const ke of kommoEnums) {
    if (usedKommoIds.has(ke.id)) continue;
    const kn = norm(ke.value);
    if (kn === an) return ke;                    // точное
    if (trans && kn === trans) return ke;         // перевод совпадает
    // также проверяем, вдруг Kommo на русском, а AMO на английском (или наоборот)
    const transK = TRANSLATIONS[kn] ? norm(TRANSLATIONS[kn]) : null;
    if (transK && transK === an) return ke;
  }
  // Проход 2: нечёткое (substring) — оригинал или перевод
  for (const ke of kommoEnums) {
    if (usedKommoIds.has(ke.id)) continue;
    const kn = norm(ke.value);
    // Оригинал содержит / является частью
    if (an.length > 2 && (kn.includes(an) || an.includes(kn))) return ke;
    // Перевод содержит / является частью
    if (trans && trans.length > 2 && (kn.includes(trans) || trans.includes(kn))) return ke;
    // Обратный перевод Kommo-значения
    const transK = TRANSLATIONS[kn] ? norm(TRANSLATIONS[kn]) : null;
    if (transK && transK.length > 2 && (an.includes(transK) || transK.includes(an))) return ke;
  }
  return null;
}

// ── API запрос ────────────────────────────────────────────────────────────────
function fetchAnalysis() {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: 'localhost', port: 3008, path: '/api/migration/fields-analysis', method: 'GET' },
      res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// ── Типы ──────────────────────────────────────────────────────────────────────
const TYPE_LABELS = {
  text:'Текст', textarea:'Много текста', numeric:'Число',
  select:'Список (один)', multiselect:'Список (много)', radiobutton:'Переключатель',
  checkbox:'Флажок', date:'Дата', date_time:'Дата и время',
  url:'URL', multitext:'Телефон/Email', tracking_data:'UTM/Трекинг',
  smart_address:'Адрес', chained_lists:'Связ. список', birthday:'День рождения',
};
function tl(t) { return TYPE_LABELS[t] || t || '—'; }

// ── Цвета ────────────────────────────────────────────────────────────────────
const C = {
  // Поля
  synced:   { bg: 'FFD1FAE5', fg: 'FF065F46' }, // зелёный
  matched:  { bg: 'FFD1FAE5', fg: 'FF065F46' },
  partial:  { bg: 'FFEDE9FE', fg: 'FF5B21B6' }, // фиолетовый
  missing:  { bg: 'FFFEF9C3', fg: 'FF713F12' }, // жёлтый
  skipped:  { bg: 'FFF3F4F6', fg: 'FF6B7280' },
  different:{ bg: 'FFFEE2E2', fg: 'FF991B1B' },
  // Строки enum-значений
  enumMatch:   { bg: 'FFD1FAE5', fg: 'FF065F46' }, // зелёный — значение есть в обеих
  enumMissing: { bg: 'FFFEF9C3', fg: 'FF713F12' }, // жёлтый  — нет в Kommo
  enumExtra:   { bg: 'FFDBEAFE', fg: 'FF1E40AF' }, // синий   — лишнее в Kommo
};

const FIELD_STATUS_LABEL = {
  synced:   '✅ Совпадает',
  matched:  '🟢 Совпадает',
  partial:  '🟣 Частично',
  missing:  '🟡 Нет в Kommo',
  skipped:  '⏭ Пропущено',
  different:'🔴 Конфликт типов',
};

// ── Колонки ───────────────────────────────────────────────────────────────────
// A-E: AMO | F: Статус | G-K: Kommo
const COLS = [
  { header: '№',               key:'num',     width: 5  },
  { header: 'Поле / Значение AMO', key:'amoName', width: 30 },
  { header: 'Тип AMO',         key:'amoType', width: 16 },
  { header: 'Code AMO',        key:'amoCode', width: 16 },
  { header: 'AMO\nзначений',   key:'amoCnt',  width: 9  },
  { header: 'Статус',          key:'status',  width: 18 },
  { header: 'Поле / Значение Kommo', key:'kName', width: 30 },
  { header: 'Тип Kommo',       key:'kType',   width: 16 },
  { header: 'Code Kommo',      key:'kCode',   width: 16 },
  { header: 'Kommo\nзначений', key:'kCnt',    width: 9  },
  { header: 'Как найдено',     key:'via',     width: 14 },
];
const NCOLS = COLS.length; // 11

const VIA = {
  name:'🔑 точное имя', code:'📌 по code',
  mapped:'📋 маппинг', translation:'🌐 перевод',
};

function borderThin() {
  return {
    top:    { style:'thin', color:{ argb:'FFD1D5DB' } },
    left:   { style:'thin', color:{ argb:'FFD1D5DB' } },
    bottom: { style:'thin', color:{ argb:'FFD1D5DB' } },
    right:  { style:'thin', color:{ argb:'FFD1D5DB' } },
  };
}

function styleCell(cell, bg, fg, bold = false, indent = 0, italic = false) {
  cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb: bg } };
  cell.font = { bold, italic, size: 9, color:{ argb: fg } };
  cell.alignment = { vertical:'top', wrapText:true, indent };
  cell.border = borderThin();
}

// ── Построение листа ──────────────────────────────────────────────────────────
function buildSheet(wb, sheetName, tabColor, entityLabel, groups) {
  const ws = wb.addWorksheet(sheetName, { tabColor:{ argb: tabColor } });
  ws.views = [{ state:'frozen', xSplit:0, ySplit:3 }];

  // Строка 1: заголовок
  ws.mergeCells(`A1:K1`);
  Object.assign(ws.getCell('A1'), {
    value: `${entityLabel}  ·  AMO «Основное» vs Kommo «Main»`,
    font: { bold:true, size:13, color:{ argb:'FF1E3A5F' } },
    fill: { type:'pattern', pattern:'solid', fgColor:{ argb:'FFE0ECF8' } },
    alignment: { horizontal:'center', vertical:'middle' },
  });
  ws.getRow(1).height = 28;

  // Строка 2: легенда
  ws.mergeCells('A2:K2');
  Object.assign(ws.getCell('A2'), {
    value: '  ✅ Зелёный = полное совпадение   🟣 Фиолетовый = частичное совпадение (не все значения в Kommo)   🟡 Жёлтый = поля/значения НЕТ в Kommo   🔵 Синий = значение есть в Kommo, но нет в AMO',
    font: { size:9, italic:true, color:{ argb:'FF374151' } },
    fill: { type:'pattern', pattern:'solid', fgColor:{ argb:'FFF9FAFB' } },
    alignment: { horizontal:'left', vertical:'middle' },
  });
  ws.getRow(2).height = 18;

  // Строка 3: заголовки
  ws.columns = COLS.map(c => ({ width: c.width }));
  const hdr = ws.getRow(3);
  COLS.forEach((c, i) => {
    const cell = hdr.getCell(i+1);
    cell.value = c.header;
    cell.font = { bold:true, size:9, color:{ argb:'FFFFFFFF' } };
    cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF1E3A5F' } };
    cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
    cell.border = { bottom:{ style:'medium', color:{ argb:'FF9CA3AF' } }, right:{ style:'thin', color:{ argb:'FF6B7280' } } };
  });
  hdr.height = 32;

  let rowIdx = 4;
  let fieldNum = 0;
  let prevGroup = null;

  const ENUM_TYPES = new Set(['select','multiselect','radiobutton']);

  groups.forEach(g => {
    // Заголовок группы
    if (g.name !== prevGroup) {
      prevGroup = g.name;
      ws.mergeCells(`A${rowIdx}:K${rowIdx}`);
      const gc = ws.getCell(`A${rowIdx}`);
      gc.value = `  📁  ${g.name}`;
      gc.font = { bold:true, italic:true, size:10, color:{ argb:'FF1E3A5F' } };
      gc.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFE5E7EB' } };
      gc.border = { bottom:{ style:'medium', color:{ argb:'FF9CA3AF' } } };
      ws.getRow(rowIdx).height = 20;
      rowIdx++;
    }

    g.fields.forEach(fp => {
      fieldNum++;
      const s = fp.status;
      const col = C[s] || { bg:'FFFFFFFF', fg:'FF374151' };

      const amoEnums  = fp.amo?.enums  || [];
      const kommoEnums= fp.kommo?.enums|| [];
      const isEnum    = ENUM_TYPES.has(fp.amo?.type) || ENUM_TYPES.has(fp.kommo?.type);
      const hasKommo  = !!fp.kommo;

      const missingIds = new Set((fp.missingEnums||[]).map(e => e.id));

      // ── Строка поля (заголовок) ──────────────────────────────────────────
      const fieldRow = ws.getRow(rowIdx);
      const enumsInfo = isEnum && amoEnums.length
        ? `${amoEnums.length} зн.`
        : '';
      const kEnumsInfo = isEnum && kommoEnums.length
        ? `${kommoEnums.length} зн.`
        : '';

      const fieldVals = [
        fieldNum,
        fp.amo?.name || '—',
        tl(fp.amo?.type),
        fp.amo?.code || '—',
        enumsInfo,
        FIELD_STATUS_LABEL[s] || s,
        fp.kommo?.name || '—',
        tl(fp.kommo?.type),
        fp.kommo?.code || '—',
        kEnumsInfo,
        VIA[fp.matchedVia] || (hasKommo ? '🔑 точное имя' : ''),
      ];

      for (let ci = 0; ci < NCOLS; ci++) {
        const cell = fieldRow.getCell(ci+1);
        cell.value = fieldVals[ci] === '' ? '' : (fieldVals[ci] ?? '');
        styleCell(cell, col.bg, col.fg, ci === 1 || ci === 6);
      }
      // Выделим статус жирным
      styleCell(fieldRow.getCell(6), col.bg, col.fg, true);
      fieldRow.height = 18;
      rowIdx++;

      // ── Строки enum-значений ─────────────────────────────────────────────
      if (isEnum && amoEnums.length > 0) {
        const usedKommoIds = new Set();

        // Строим пары: для каждого AMO enum — ищем Kommo-совпадение
        const pairs = amoEnums.map(ae => {
          const isMissing = missingIds.has(ae.id);
          let ke = null;
          if (!isMissing && kommoEnums.length > 0) {
            ke = findMatchingKommoEnum(ae.value, kommoEnums, usedKommoIds);
            if (ke) usedKommoIds.add(ke.id);
          }
          return { ae, ke, isMissing: !ke };
        });

        // Пишем строки для AMO значений
        pairs.forEach(({ ae, ke, isMissing }) => {
          const row = ws.getRow(rowIdx);
          const enumCol = isMissing ? C.enumMissing : C.enumMatch;

          // A пустая (№), B — значение AMO, C-E пустые, F статус, G — значение Kommo
          row.getCell(1).value = '';
          styleCell(row.getCell(1), enumCol.bg, enumCol.fg);

          row.getCell(2).value = `  • ${ae.value}`;
          styleCell(row.getCell(2), enumCol.bg, enumCol.fg, false, 1, false);

          // C,D,E — пустые (тип/код/счётчик уже в строке поля)
          for (let ci = 3; ci <= 5; ci++) {
            row.getCell(ci).value = '';
            styleCell(row.getCell(ci), enumCol.bg, enumCol.fg);
          }

          // F — статус значения
          row.getCell(6).value = isMissing ? '🟡 Нет в Kommo' : '✅';
          styleCell(row.getCell(6), enumCol.bg, enumCol.fg, false);

          // G — совпадающее Kommo значение
          row.getCell(7).value = ke ? `  • ${ke.value}` : '';
          styleCell(row.getCell(7), enumCol.bg, enumCol.fg, false, 1);

          // H-K пустые
          for (let ci = 8; ci <= NCOLS; ci++) {
            row.getCell(ci).value = '';
            styleCell(row.getCell(ci), enumCol.bg, enumCol.fg);
          }

          row.height = 15;
          rowIdx++;
        });

        // Лишние значения в Kommo (нет в AMO)
        const extraKommo = kommoEnums.filter(ke => !usedKommoIds.has(ke.id));
        extraKommo.forEach(ke => {
          const row = ws.getRow(rowIdx);
          for (let ci = 1; ci <= NCOLS; ci++) {
            row.getCell(ci).value = '';
            styleCell(row.getCell(ci), C.enumExtra.bg, C.enumExtra.fg);
          }
          row.getCell(6).value = '🔵 Только в Kommo';
          styleCell(row.getCell(6), C.enumExtra.bg, C.enumExtra.fg, false);
          row.getCell(7).value = `  • ${ke.value}`;
          styleCell(row.getCell(7), C.enumExtra.bg, C.enumExtra.fg, false, 1);
          row.height = 15;
          rowIdx++;
        });

        // Разделительная строка после enum-блока
        ws.mergeCells(`A${rowIdx}:K${rowIdx}`);
        ws.getRow(rowIdx).getCell(1).fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFF1F5F9' } };
        ws.getRow(rowIdx).height = 4;
        rowIdx++;
      }
    });
  });

  // Итог
  ws.mergeCells(`A${rowIdx}:K${rowIdx}`);
  const totCell = ws.getCell(`A${rowIdx}`);
  totCell.value = `  Итого полей: ${fieldNum}`;
  totCell.font = { bold:true, size:10, color:{ argb:'FF1E3A5F' } };
  totCell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFE0ECF8' } };
  ws.getRow(rowIdx).height = 20;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log('Запрашиваем fields-analysis...');
  const analysis = await fetchAnalysis();
  if (analysis.error) {
    console.error('API error:', analysis.error);
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'AMO→Kommo Migration';
  wb.created = new Date();

  const entityConfig = [
    { key:'leads',     label:'📋 Сделки',   sheetName:'Сделки',   color:'FF0F7038' },
    { key:'contacts',  label:'👤 Контакты', sheetName:'Контакты', color:'FF6D28D9' },
    { key:'companies', label:'🏢 Компании', sheetName:'Компании', color:'FF92400E' },
  ];

  let totalFields = 0;

  for (const ec of entityConfig) {
    const entityData = analysis.entities?.[ec.key];
    if (!entityData) { console.log(`  ${ec.label}: нет данных`); continue; }

    const filteredGroups = (entityData.groups || []).filter(g => {
      const n = (g.name || '').toLowerCase().trim();
      return TARGET_GROUPS.some(t => n === t || n.startsWith(t));
    });

    if (!filteredGroups.length) {
      console.log(`  ${ec.label}: группы не найдены. Доступные: ${(entityData.groups||[]).map(g=>'"'+g.name+'"').join(', ')}`);
      // fallback — все группы
      continue;
    }

    const cnt = filteredGroups.reduce((s,g) => s + (g.fields||[]).length, 0);
    totalFields += cnt;
    console.log(`  ${ec.label}: ${filteredGroups.length} групп, ${cnt} полей`);

    buildSheet(wb, ec.sheetName, ec.color, ec.label,
      filteredGroups.map(g => ({ name: g.name, fields: g.fields || [] }))
    );
  }

  if (totalFields === 0) {
    console.error('⚠ Полей не найдено. Проверьте названия групп в fields-analysis.');
    process.exit(1);
  }

  const outPath = '/tmp/field_mapping_paired.xlsx';
  await wb.xlsx.writeFile(outPath);
  console.log(`\n✅ Excel сохранён: ${outPath}  (${totalFields} полей)`);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
