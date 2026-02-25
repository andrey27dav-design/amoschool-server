const express = require('express');
const router = express.Router();
const migrationService = require('../services/migrationService');
const batchService = require('../services/batchMigrationService');
const backupService = require('../services/backupService');
const logger = require('../utils/logger');
const amoApi = require('../services/amoApi');
const kommoApi = require('../services/kommoApi');

// GET /api/migration/status
/**
 * compareFields — сравнивает поле AMO с полем Kommo и возвращает статус совпадения.
 * Статусы: 'synced' (полностью совпадает), 'matched' (совпадает основное),
 *          'different' (отличия есть), 'missing' (поле не найдено в Kommo).
 */
const ENUM_TYPES = ['select', 'multiselect', 'radiobutton'];

// Пары типов, которые считаются «мягко совместимыми»:
// при несовпадении типа поле показывается как matched/partial, а не missing.
const SOFT_TYPE_COMPAT = [
  ['text','textarea'], ['text','url'], ['textarea','url'],
  ['select','radiobutton'],
  ['select','multiselect'], ['radiobutton','multiselect'],
  ['date','date_time'],
];
function isSoftTypeCompat(a, b) {
  if (a === b) return true;
  return SOFT_TYPE_COMPAT.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}

// ── Кросс-языковые кластеры значений перечислений ───────────────────────────
// Если AMO-значение и Kommo-значение попадают в один кластер — они считаются
// семантически эквивалентными (не нужно добавлять в Kommo).
const ENUM_VALUE_ALIASES = [
  // Пол / Gender
  ['м', 'мужской', 'мужчина', 'male', 'man', 'boy', 'm'],
  ['ж', 'женский', 'женщина', 'female', 'woman', 'girl', 'f'],
  // Роль / Relationship
  ['мама', 'мать', 'mother', 'mom'],
  ['папа', 'отец', 'father', 'dad'],
  ['бабушка', 'grandmother', 'grandma'],
  ['дедушка', 'grandfather', 'grandpa'],
  ['няня', 'nanny', 'babysitter'],
  ['опекун', 'guardian'],
  // Да / Нет
  ['да', 'yes', 'true', 'верно'],
  ['нет', 'no', 'false', 'неверно'],
  // Источники трафика
  ['вконтакте', 'вк', 'vk', 'vkontakte'],
  ['instagram', 'инстаграм', 'инста'],
  ['facebook', 'фейсбук', 'fb'],
  ['telegram', 'телеграм', 'tg'],
  ['whatsapp', 'вотсап', 'wa', 'whats app'],
  ['viber', 'вайбер'],
  ['рекомендация', 'recommendation', 'referral', 'сарафанное радио'],
  ['другое', 'other', 'иное', 'прочее', 'другая'],
  ['с сайта', 'landing', 'лендинг', 'website', 'сайт'],
  ['blogger', 'блогер', 'блогеры', 'инфлюенсер'],
  // Роль / Relationship (ребенок = student himself OR infant как причина отказа)
  ['ребенок', 'ребёнок', 'child', 'student himself', 'kid', 'сам ученик', 'infant'],
  // Продукты
  ['репетиторство', 'репетиторство рф', 'репетиторство мш', 'tutoring', 'tutor', 'репетитор'],
  ['школа рф', 'school'],
  ['лагерь', 'camp', 'summer camp'],
  ['международная школа', 'international school'],
  // Качество лида
  ['целевой', 'qualified', 'a (целевой)'],
  ['не срочный', 'b (не срочный)', 'potential'],
  ['не целевой', 'c (не целевой)', 'unqualified'],
  // ── Причина закрытия / Cause of loss ──────────────────────────────
  ['слишком дорого', 'too expensive', 'дорого', 'цена высокая'],
  ['не устроили условия', 'the terms were not acceptable', 'условия не устроили', 'условия не подошли'],
  ['выбрали других', 'chose others', 'выбрали конкурента', 'выбрали конкурентов'],
  ['нет подходящей услуги', 'there is no suitable product', 'no suitable product', 'нет нужного продукта'],
  ['нет ответа', 'no answer', 'no response', 'не отвечает'],
  ['негатив не звонить', 'негатив, не звонить', 'negative feedback, do not call', 'negative feedback do not call', 'не звонить'],
  ['работа сотрудничество спам', 'работа, сотрудничество, спам', 'spam', 'спам', 'рассылка'],
  ['текущий ученик', 'current student', 'действующий клиент', 'текущий клиент'],
  ['дубль', 'duplicate', 'дублирует', 'дубликат'],
  ['не оставляли заявку', 'did not submit an application', 'не подавали заявку', 'не подавал заявку'],
  ['это организация', 'this is an organisation', 'this is an organization', 'организация'],
  ['пропала потребность', 'no longer needed', 'lost interest', 'потребность отпала'],
  // Месяцы
  ['январь', 'january', 'jan'],
  ['февраль', 'february', 'feb'],
  ['март', 'march', 'mar'],
  ['апрель', 'april', 'apr'],
  ['май', 'may'],
  ['июнь', 'june', 'jun'],
  ['июль', 'july', 'jul'],
  ['август', 'august', 'aug'],
  ['сентябрь', 'september', 'sep'],
  ['октябрь', 'october', 'oct'],
  ['ноябрь', 'november', 'nov'],
  ['декабрь', 'december', 'dec'],
];

/**
 * Возвращает true, если AMO-значение семантически эквивалентно
 * хотя бы одному значению из множества Kommo (kValSet — нормализованные строки,
 * kValArr — массив { norm } для кластерного поиска).
 */
/** Нормализует enum-значение: lower, убирает пунктуацию, схлопывает пробелы */
function normEnumVal(v) {
  return (v || '').toLowerCase()
    .replace(/[,;.()\[\]\/#!?«»"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function enumValueSemanticMatch(amoVal, kValSet, kValNorms) {
  const aNorm = normEnumVal(amoVal);
  if (!aNorm) return false;

  // 1. Точное совпадение (нормализованное)
  if (kValSet.has(aNorm)) return true;
  // Также проверяем нормализованную версию каждого Kommo-значения
  const kNormsNorm = kValNorms.map(normEnumVal);
  const kSetNorm = new Set(kNormsNorm);
  if (kSetNorm.has(aNorm)) return true;

  // 2. Кросс-языковой кластер — полная нормализованная строка
  for (const cluster of ENUM_VALUE_ALIASES) {
    if (!cluster.includes(aNorm)) continue;
    for (const kn of kNormsNorm) {
      if (cluster.includes(kn)) return true;
    }
  }

  // 3. Кросс-языковой кластер — по токенам AMO-значения
  // (срабатывает только если токен длинный >= 4 символа, чтобы не было ложных совпадений)
  const aTokens = aNorm.split(/\s+/).filter(t => t.length >= 4);
  for (const tok of aTokens) {
    for (const cluster of ENUM_VALUE_ALIASES) {
      if (!cluster.includes(tok)) continue;
      for (const kn of kNormsNorm) {
        if (cluster.includes(kn)) return true;
      }
    }
  }

  return false;
}

function compareFields(amoField, kommoField, mappingEntry) {
  if (!kommoField) return { status: 'missing', differences: [] };

  const typesMatch = amoField.type === kommoField.type;
  if (!typesMatch && !isSoftTypeCompat(amoField.type, kommoField.type)) {
    // Принципиально несовместимые типы → создать новое поле
    return { status: 'missing', differences: ['type'], typeConflict: true };
  }

  const diffs = [];
  if (!typesMatch) diffs.push('type'); // мягко совместимые — отличие фиксируем, но не конфликт

  // Видимость через API — не для системных (is_predefined) полей AMO.
  if (!amoField.is_predefined && !!amoField.is_api_only !== !!kommoField.is_api_only) {
    diffs.push('is_api_only');
  }

  // Enum-поля (select/multiselect/radiobutton): проверяем что все AMO-значения
  // семантически присутствуют в Kommo (с кросс-языковым сравнением).
  // Если в AMO есть значения без семантического эквивалента в Kommo → partial.
  if (ENUM_TYPES.includes(amoField.type)) {
    const kValNorms = (kommoField.enums || [])
      .map(e => normEnumVal(e.value)).filter(Boolean);
    const kValSet = new Set(kValNorms);
    const missingInKommo = (amoField.enums || []).filter(
      e => e.value && !enumValueSemanticMatch(e.value, kValSet, kValNorms)
    );
    if (missingInKommo.length > 0) {
      return {
        status: 'partial',
        differences: ['enums'],
        missingEnums: missingInKommo,
        missingCount: missingInKommo.length,
      };
    }
    // Все AMO-значения есть в Kommo — enums не является различием
  }

  // Вложенные списки (chained_lists): аналогично — ищем значения AMO, которых нет в Kommo
  if (amoField.type === 'chained_lists') {
    const aItems = amoField.nested_values || amoField.enums || amoField.values || [];
    const kItems = kommoField.nested_values || kommoField.enums || kommoField.values || [];
    const kTopSet = new Set(kItems.map(v => (v.value || v.name || '').toLowerCase().trim()));
    const missingTop = aItems.filter(v => {
      const nm = (v.value || v.name || '').toLowerCase().trim();
      return nm && !kTopSet.has(nm);
    });
    // Проверяем вложенные уровни для совпадающих вершин
    let missingNested = 0;
    aItems.forEach(av => {
      const kv = kItems.find(k =>
        (k.value || k.name || '').toLowerCase().trim() ===
        (av.value || av.name || '').toLowerCase().trim()
      );
      if (kv) {
        const kNestedSet = new Set((kv.nested || []).map(n => (n.value || n.name || '').toLowerCase().trim()));
        missingNested += (av.nested || []).filter(n => {
          const nm = (n.value || n.name || '').toLowerCase().trim();
          return nm && !kNestedSet.has(nm);
        }).length;
      }
    });
    if (missingTop.length > 0 || missingNested > 0) {
      return {
        status: 'partial',
        differences: ['nested'],
        missingEnums: missingTop,
        missingCount: missingTop.length + missingNested,
      };
    }
  }

  // exactMatch: true — значит поля полностью идентичны.
  // Финальный статус 'synced' определяется не здесь, а в fields-analysis
  // (только если поле уже подтверждено/создано через маппинг).
  if (diffs.length === 0) return { status: 'matched', differences: [], exactMatch: true };
  return { status: 'matched', differences: diffs };
}


// ── Кросс-языковой словарь синонимов ────────────────────────────────────────
// ВАЖНО: каждый кластер должен быть достаточно специфичен.
// Матчинг только по ТОЧНОМУ совпадению токена с одним из алиасов кластера.
const FIELD_ALIASES = [
  // Контактные
  ['телефон','phone','тел','tel','mobile','моб','мобильный','сотовый','cell','phones'],
  ['email','почта','e-mail','mail','эл почта','электронная почта','emails'],
  ['сайт','website','site','веб','web','www','homepage'],
  ['skype','скайп'],
  ['instagram','инстаграм','инста'],
  ['facebook','фейсбук','fb'],
  ['вконтакте','вк','vk','vkontakte'],
  ['telegram','телеграм','tg'],
  ['whatsapp','вотсап','wa'],
  ['viber','вайбер'],
  // Персональные
  ['имя','name','наименование','название','fullname'],
  ['фамилия','lastname','surname'],
  ['день рождения','birthday','birthdate','дата рождения'],
  ['пол','gender','sex','male female','malefemale','пол контакта'],
  ['возраст','age'],
  // Профессиональные
  ['должность','position','jobtitle','профессия','occupation'],
  ['отдел','department','dept','division'],
  ['компания','company','организация','organization','фирма','firm'],
  // Адресные
  ['адрес','address','addr'],
  ['город','city','town'],
  ['страна','country'],
  ['регион','region','область','край','province','state'],
  ['индекс','zip','postal','postcode','почтовый'],
  ['улица','street'],
  // Финансовые
  ['бюджет','budget','сумма','amount','стоимость','cost','price','цена','sum'],
  ['скидка','discount'],
  ['налог','tax','ндс','vat','nds'],
  ['счёт','счет','invoice','bill','оплата','payment'],
  ['выручка','revenue','доход','income'],
  // UTM — КАЖДОЕ ПОЛЕ ОТДЕЛЬНЫМ КЛАСТЕРОМ
  ['utm source','utm_source','utmsource','источник рекламы','рекламный источник','источник трафика'],
  ['utm medium','utm_medium','utmmedium','канал рекламы','рекламный канал','тип трафика'],
  ['utm campaign','utm_campaign','utmcampaign','рекламная кампания','кампания'],
  ['utm content','utm_content','utmcontent','содержание объявления','содержание рекламы'],
  ['utm term','utm_term','utmterm','ключевое слово','ключевые слова'],
  // Источник сделки/лида (ОТДЕЛЬНО от utm)
  ['источник','source','leadsource','trafficsource','источник лида','источник сделки'],
  // Продукт / услуга
  ['продукт','product','товар','услуга','service','item','goods'],
  // Канал (общий) — ОТДЕЛЬНО от utm-medium
  ['канал','channel','маркетинговый канал'],
  // Даты
  ['дата создания','created','createdat','дата добавления'],
  ['дата обновления','updated','updatedat','изменён','modified'],
  ['дата закрытия','closed','closing','closedate','дата завершения','deadline'],
  ['дата','date'],
  // Качество и оценки — ОТДЕЛЬНЫЕ КЛАСТЕРЫ
  ['качество лида','lead quality','лид скор','lead score'],
  ['качество','quality','оценка качества'],
  ['лид','lead','потенциальный клиент'],
  ['рейтинг','rating','score','оценка'],
  // Общие
  ['описание','description','desc','подробности','details'],
  ['комментарий','comment','notes','заметки','примечание','remarks'],
  ['тег','tag','метка','label','теги'],
  ['статус','status','состояние','stage'],
  ['приоритет','priority','важность'],
  ['ответственный','owner','responsible','manager','менеджер','assigned'],
  // Реквизиты
  ['инн','inn'],
  ['кпп','kpp'],
  ['огрн','ogrn'],
  ['бик','bik'],
  // Ссылки
  ['ссылка','link','url','href'],
  // Авто
  ['автомобиль','car','vehicle','транспорт','transport'],
  ['vin','вин'],
  // Трекинг (общий)
  ['трекинг','tracking','отслеживание','аналитика'],
  // Квалификация лида
  ['квалифицирован','qualified','is qualified','квалификация лида','квалифицирован контакт'],
  // Ученик / Student
  ['ученик','student','учащийся','pupil'],
  // Роль / Relationship (кем является контакт по отношению к ученику)
  ['роль','role','relationship','роль в семье','relationship to student','relationship to the student'],
  // Пробное занятие — дата и время
  ['дата и время пробного урока','date and time of demo','дата пробного урока','trial lesson datetime','demo datetime','date and time of the demo','дата время пробный'],
  // Пробное занятие — запись
  ['записан на пробное','registered for demo','registered for the demo','registered demo','записан пробный','запись на пробный урок'],
  // Пробное занятие — посещение
  ['был на пробном','attended demo','attended the demo','посещение пробного','был на пробном занятии'],
  // Оценка после пробного урока
  ['оценка после пробного','grade after demo','grade received after demo','grade recived after demo','оценка пробного урока'],
  // Проверка качества сделки
  ['прошла проверку','deal reviewed','the deal has been reviewed','проверка сделки','deal has been reviewed'],
  // Комментарий проверяющего
  ['кто проверил','who reviewed','quality control comment','контроль качества комментарий'],
  // Отписка от рассылки
  ['отписался','unsubscribed','отписалась','отписан от рассылки','unsubscribe'],
  // Причина закрытия / потери
  ['причина закрытия','cause of loss','причина отказа','loss reason','причина потери'],
  // Комментарий к причине закрытия
  ['комментарий к причине','cause of loss commentary','ответственный за закрытие'],
];

// Кросс-языковой маппинг групп AMO → Kommo
const AMO_KOMMO_GROUP_NAME_MAP = {
  'основное':      'main',
  'main':          'основное',
  'статистика':    'statistics',
  'statistics':    'статистика',
  'без группы':    'main',
  'general':       'основное',
  'счета/покупки': 'invoices',
  'покупки':       'invoices',
  'all leads':     'все сделки',
  'все сделки':    'all leads',
};

/** Нормализует строку → массив токенов */
function normalizeTokens(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[_\-\.\/ ,;:@#*+(\)[\]]/g, ' ')
    .replace(/[^а-яёa-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(t => t.length > 0);
}

/**
 * findAliasCluster — СТРОГИЙ поиск кластера.
 * Только ТОЧНОЕ совпадение токена ИЛИ полного нормализованного имени с alias.
 * Никаких вхождений substr (alias.includes(tok)) — это вызывало багги.
 */
function findAliasCluster(tokens, fullNorm) {
  // Проверяем полное нормализованное имя как единую фразу
  if (fullNorm) {
    for (const cluster of FIELD_ALIASES) {
      if (cluster.includes(fullNorm)) return cluster;
    }
  }
  // Проверяем каждый токен — только ТОЧНОЕ совпадение
  for (const cluster of FIELD_ALIASES) {
    for (const tok of tokens) {
      if (cluster.includes(tok)) return cluster;
    }
  }
  return null;
}

/** Типы полей, совместимые при сопоставлении */
const TYPE_COMPAT = {
  text:          ['text','textarea','url','multitext'],
  textarea:      ['text','textarea'],
  url:           ['url','text'],
  multitext:     ['multitext','text'],
  numeric:       ['numeric'],
  select:        ['select','radiobutton'],
  radiobutton:   ['select','radiobutton'],
  multiselect:   ['multiselect','select'],
  checkbox:      ['checkbox'],
  date:          ['date','date_time'],
  date_time:     ['date','date_time'],
  tracking_data: ['tracking_data'],
  smart_address: ['smart_address'],
  chained_lists: ['chained_lists'],
};

/**
 * findCrossLangMatch — строгий кросс-языковой матчинг.
 * Возвращает { field, via: 'translation', score } или null.
 * 
 * ПРАВИЛА (чтобы не было ложных совпадений):
 * 1. Оба поля должны попасть в один и тот же кластер FIELD_ALIASES
 * 2. Оба поля должны иметь совместимые типы
 * 3. Матчинг — только через точное совпадение токена или полного имени с alias
 * 4. kommoFields должны быть предфильтрованы (только ещё не занятые)
 * 
 * Порог: score >= 80 (чтобы отсечь совпадения вида "источник" vs все поля с токеном "source")
 * Если у AMO-поля несколько токенов и только часть из них совпадает с кластером — штраф.
 */
function findCrossLangMatch(amoField, availableKommoFields) {
  const amoTokens  = normalizeTokens(amoField.name);
  const amoFull    = amoTokens.join(' ');
  const amoCluster = findAliasCluster(amoTokens, amoFull);
  if (!amoCluster) return null;

  const compatTypes = TYPE_COMPAT[amoField.type] || [amoField.type];
  let best = null;

  for (const kf of availableKommoFields) {
    if (!compatTypes.includes(kf.type)) continue;
    const kTokens  = normalizeTokens(kf.name);
    const kFull    = kTokens.join(' ');
    const kCluster = findAliasCluster(kTokens, kFull);

    // Оба поля должны быть в одном кластере
    if (!kCluster || kCluster !== amoCluster) continue;

    // Базовый score = 100 при совпадении кластера
    let score = 100;

    // Бонус за точное совпадение типа (важен при нескольких кандидатах в кластере)
    if (kf.type === amoField.type) score += 30;

    // Штраф если AMO-поле длинное (>2 токенов), но только один из них попал в кластер.
    // Применяем ТОЛЬКО если тип не совпадает точно (чтобы не штрафовать верные пары)
    // -25 (не -20) чтобы итоговый score 75 < 80 отсекал ложные совпадения вида
    // "Комментарий" (1 токен) → "Комментарий для отложенных" (3 токена, 1 в кластере)
    const amoMatchCount = amoTokens.filter(t => amoCluster.includes(t)).length;
    const amoFullMatch  = amoCluster.includes(amoFull);
    if (!amoFullMatch && amoTokens.length > 2 && amoMatchCount < 2 && kf.type !== amoField.type) score -= 25;

    // Аналогично для Kommo
    const kMatchCount = kTokens.filter(t => kCluster.includes(t)).length;
    const kFullMatch  = kCluster.includes(kFull);
    if (!kFullMatch && kTokens.length > 2 && kMatchCount < 2 && kf.type !== amoField.type) score -= 25;

    if (score >= 80 && score > (best?.score || 0)) {
      best = { field: kf, via: 'translation', score };
    }
  }
  return best || null;
}


router.get('/status', (req, res) => {
  res.json(migrationService.getState());
});

// POST /api/migration/start
const createdGroupCache = {};    // key: entityType:groupNameLc => groupId (settled)
const groupCreationPending = {}; // key: entityType:groupNameLc => Promise<string|null> (in-flight)

router.post('/start', async (req, res) => {
  try {
    // Start migration in background
    migrationService.runMigration().catch((e) => {
      logger.error('Background migration error:', e);
    });

    res.json({ message: 'Migration started', status: 'running' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/migration/rollback
router.post('/rollback', async (req, res) => {
  try {
    const { steps } = req.body || {};
    // Run rollback in background
    migrationService.rollback(steps).catch((e) => {
      logger.error('Background rollback error:', e);
    });
    res.json({ message: 'Rollback started' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/migration/sync-stages
// Body: { amoPipelineId?, kommoPipelineId? }
router.post('/sync-stages', async (req, res) => {
  try {
    const { amoPipelineId, kommoPipelineId } = req.body || {};
    const result = await migrationService.syncPipelineStages(
      amoPipelineId ? Number(amoPipelineId) : null,
      kommoPipelineId ? Number(kommoPipelineId) : null,
    );
    res.json({ message: 'Stages synchronized', ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/migration/backups
router.get('/backups', async (req, res) => {
  const backups = await backupService.listBackups();
  res.json(backups);
});

// GET /api/migration/amo-stages
router.get('/amo-stages', (req, res) => {
  res.json(migrationService.AMO_STAGES_ORDERED);
});

// ─── Batch migration endpoints ──────────────────────────────────────────────

// GET /api/migration/analyze-managers
router.get('/analyze-managers', async (req, res) => {
  try {
    const result = await batchService.analyzeManagers();
    res.json(result);
  } catch (e) {
    logger.error('analyze-managers error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/migration/batch-config
router.get('/batch-config', (req, res) => {
  res.json(batchService.getBatchConfig());
});

// POST /api/migration/batch-config
router.post('/batch-config', (req, res) => {
  try {
    batchService.setBatchConfig(req.body);
    res.json({ ok: true, config: batchService.getBatchConfig() });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// GET /api/migration/batch-status
router.get('/batch-status', (req, res) => {
  res.json(batchService.getBatchState());
});

// GET /api/migration/batch-stats
router.get('/batch-stats', (req, res) => {
  const stats = batchService.getStats();
  if (!stats) return res.status(404).json({ error: 'Data not loaded yet' });
  res.json(stats);
});

// POST /api/migration/batch-start
router.post('/batch-start', async (req, res) => {
  try {
    // Get latest stage mapping from main service
    const mainState = migrationService.getState();
    const stageMapping = mainState?.stageMapping || {};
    // Start batch in background
    batchService.runBatchMigration(stageMapping).catch(e => {
      logger.error('Background batch error:', e);
    });
    res.json({ message: 'Batch migration started', status: 'running' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/migration/batch-rollback
router.post('/batch-rollback', async (req, res) => {
  try {
    batchService.rollbackBatch().catch(e => {
      logger.error('Background batch rollback error:', e);
    });
    res.json({ message: 'Batch rollback started' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/migration/batch-reset
router.post('/batch-reset', (req, res) => {
  try {
    batchService.resetOffset();
    res.json({ ok: true, message: 'Счётчик сброшен' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/sync-fields', async (req, res) => {
  try {
    const { buildAllFieldMappings, saveFieldMapping, getFieldMappingStats } = require('../utils/fieldMapping');
    const fse = require('fs-extra');
    const pathMod = require('path');
    const cfg = require('../config');
    const stagePath = pathMod.resolve(cfg.backupDir, 'stage_mapping.json');
    const stageMapping = fse.existsSync(stagePath) ? fse.readJsonSync(stagePath) : {};
    const kommoPipelineId = cfg.kommo.pipelineId;
    const { mapping, stats } = await buildAllFieldMappings(amoApi, kommoApi, stageMapping, kommoPipelineId);
    saveFieldMapping(mapping);
    const fieldStats = getFieldMappingStats(mapping);
    res.json({ ok: true, stats: fieldStats, details: stats });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/sync-fields', (req, res) => {
  const { loadFieldMapping, getFieldMappingStats, FIELD_MAPPING_FILE } = require('../utils/fieldMapping');
  const fse = require('fs-extra');
  const mapping = loadFieldMapping();
  if (!mapping) return res.json({ synced: false });
  const stats = getFieldMappingStats(mapping);
  const mtime = fse.existsSync(FIELD_MAPPING_FILE) ? fse.statSync(FIELD_MAPPING_FILE).mtime : null;
  res.json({ synced: true, stats, syncedAt: mtime });
});


/**
 * GET /api/migration/fields-analysis
 * Возвращает детальное сравнение кастомных полей между AMO и Kommo.
 * Поля группируются по сущностям (leads/contacts/companies) и по группам полей.
 * Статусы сравнения: synced, matched, different, missing.
 */
router.get('/fields-analysis', async (req, res) => {
  try {
    const fse    = require('fs-extra');
    const pathM  = require('path');
    const cfg    = require('../config');
    const { loadFieldMapping } = require('../utils/fieldMapping');
    const existingMapping = loadFieldMapping() || {};

    // Загружаем список пропущенных полей из файла (если есть)
    const skipPath   = pathM.resolve(cfg.backupDir, 'skipped_fields.json');
    const skippedIds = fse.existsSync(skipPath) ? fse.readJsonSync(skipPath) : {};

    const entities = ['leads', 'contacts', 'companies'];
    const ENTITY_LABELS = { leads: 'Сделки', contacts: 'Контакты', companies: 'Компании' };
    const result = {};
    const summary = { total: 0, synced: 0, matched: 0, partial: 0, different: 0, missing: 0, skipped: 0 };

    for (const entity of entities) {
      const [amoFields, kommoFields, amoGroups, kommoGroups] = await Promise.all([
        amoApi.getCustomFields(entity),
        kommoApi.getCustomFields(entity),
        amoApi.getCustomFieldGroups ? amoApi.getCustomFieldGroups(entity) : Promise.resolve([]),
        kommoApi.getCustomFieldGroups ? kommoApi.getCustomFieldGroups(entity) : Promise.resolve([]),
      ]);

      // Индексируем Kommo-поля
      const kByCode = {};
      const kByName = {};
      kommoFields.forEach(f => {
        if (f.code) kByCode[f.code.toUpperCase()] = f;
        kByName[(f.name || '').toLowerCase().trim()] = f;
      });

      // Индексируем Kommo-группы по name
      const kGroupByName = {};
      kommoGroups.forEach(g => { kGroupByName[(g.name || '').toLowerCase().trim()] = g; });

      // AMO-группы без аналога в Kommo, для которых блокируем автоматический матчинг.
      // Блокируем только если группа: (а) НЕ в AMO_KOMMO_GROUP_NAME_MAP (не известна системе)
      //   И (б) Kommo не имеет группы с таким именем/псевдонимом.
      // Если группа есть в AMO_KOMMO_GROUP_NAME_MAP (напр. "Статистика" → "statistics") —
      // разрешаем матчинг полей, даже если Kommo-группа ещё не создана.
      const amoGroupsWithNoKommo = new Set();
      amoGroups.forEach(g => {
        const n = (g.name || '').toLowerCase().trim();
        const mapped = AMO_KOMMO_GROUP_NAME_MAP[n] || n;
        const hasKommoGroup  = !!(kGroupByName[mapped] || kGroupByName[n]);
        const isKnownMapping = !!AMO_KOMMO_GROUP_NAME_MAP[n];
        // Блокируем: нет Kommo-группы И имя группы неизвестно в карте переименований
        if (!hasKommoGroup && !isKnownMapping) amoGroupsWithNoKommo.add(g.id);
      });

      // Индексируем AMO-группы
      const amoGroupMap = {};
      amoGroups.forEach(g => {
        amoGroupMap[g.id] = g;
        amoGroupMap[entity + '_' + g.id] = g;
      });

      const entityMapping = (existingMapping[entity] || {});

      // Очищаем устаревшие маппинги: если kommoFieldId исчез из Kommo (поле удалено),
      // убираем запись, чтобы поле показывалось как 'missing', а не 'synced'.
      const kIdSet = new Set(kommoFields.map(f => f.id));
      let mappingDirty = false;
      Object.keys(entityMapping).forEach(amoId => {
        const kommoId = entityMapping[amoId]?.kommoFieldId;
        if (kommoId && !kIdSet.has(kommoId)) {
          logger.info(`[fields-analysis] Stale mapping ${entity}.${amoId} → kommoFieldId ${kommoId} (not in Kommo), removing`);
          delete entityMapping[amoId];
          if (!existingMapping[entity]) existingMapping[entity] = {};
          delete existingMapping[entity][amoId];
          mappingDirty = true;
        }
      });
      if (mappingDirty) {
        const { saveFieldMapping } = require('../utils/fieldMapping');
        saveFieldMapping(existingMapping);
        logger.info(`[fields-analysis] Saved cleaned mapping for ${entity}`);
      }

      // Группируем AMO-поля по группам (для итогового рендера)
      const grouped = {};
      const ungrouped = [];
      amoFields.forEach(f => {
        if (f.group_id && amoGroupMap[f.group_id]) {
          const g = amoGroupMap[f.group_id];
          if (!grouped[g.id]) grouped[g.id] = { id: g.id, name: g.name, sort: g.sort || 999, fields: [] };
          grouped[g.id].fields.push(f);
        } else {
          ungrouped.push(f);
        }
      });
      Object.values(grouped).forEach(g => g.fields.sort((a, b) => (a.sort || 0) - (b.sort || 0)));
      ungrouped.sort((a, b) => (a.sort || 0) - (b.sort || 0));
      const sortedGroups = Object.values(grouped).sort((a, b) => a.sort - b.sort);
      if (ungrouped.length > 0) {
        sortedGroups.push({ id: '__ungrouped__', name: 'Основное', sort: 9999, fields: ungrouped });
      }

      // ────────────────────────────────────────────────────────────────────
      // ДВУХПРОХОДНЫЙ МАТЧИНГ С 1:1 ДЕДУПЛИКАЦИЕЙ
      // ────────────────────────────────────────────────────────────────────
      // Структура: matchMap[amoFieldId] = { kf, via, score }
      const matchMap = {};

      // Все AMO-поля для этой сущности
      const allAmoFields = sortedGroups.flatMap(g => g.fields);

      // ── Проход 1: надёжные совпадения (code / name / mapped) ──
      // Обходим поля в порядке sort, занимаем Kommo-поля жадно.
      // Если два AMO-поля претендуют на одно Kommo-поле — первое по sort побеждает.
      const usedKommoIds = new Set();

      allAmoFields.forEach(af => {
        if (skippedIds[entity + '_' + af.id]) return;

        let kf = null, via = null;
        // Поля из AMO-групп без аналога в Kommo не матчатся по коду/имени.
        // Матчинг разрешён только по сохранённому маппингу (уже подтверждено оператором).
        const groupHasNoKommo = !!(af.group_id && amoGroupsWithNoKommo.has(af.group_id));

        // 1a. По code
        if (!groupHasNoKommo && af.code) {
          const cand = kByCode[af.code.toUpperCase()];
          if (cand && !usedKommoIds.has(cand.id)) { kf = cand; via = 'code'; }
        }
        // 1b. По name (точное совпадение, case-insensitive)
        if (!groupHasNoKommo && !kf) {
          const cand = kByName[(af.name || '').toLowerCase().trim()];
          if (cand && !usedKommoIds.has(cand.id)) { kf = cand; via = 'name'; }
        }
        // 1c. По сохранённому маппингу (ранее созданные поля) — разрешён всегда
        if (!kf) {
          const mappedId = entityMapping[af.id]?.kommoFieldId || null;
          if (mappedId) {
            const cand = kommoFields.find(f => f.id === mappedId);
            if (cand && !usedKommoIds.has(cand.id)) { kf = cand; via = 'mapped'; }
          }
        }

        if (kf) {
          usedKommoIds.add(kf.id);
          matchMap[af.id] = { kf, via, score: 95 };
        }
      });

      // ── Проход 2: кросс-языковой анализ для незанятых Kommo-полей ──
      const availableKommoFields = kommoFields.filter(kf => !usedKommoIds.has(kf.id));

      allAmoFields.forEach(af => {
        if (skippedIds[entity + '_' + af.id]) return;
        if (matchMap[af.id]) return; // уже найдено надёжным способом
        // Группы без аналога в Kommo — кросс-языковой матчинг не применяем
        if (af.group_id && amoGroupsWithNoKommo.has(af.group_id)) return;

        const clm = findCrossLangMatch(af, availableKommoFields);
        if (clm) {
          // Проверяем что этот Kommo-результат ещё не занят другим AMO-полем
          // (возможно, если два AMO-поля в одном кластере)
          if (!usedKommoIds.has(clm.field.id)) {
            usedKommoIds.add(clm.field.id);
            // Удаляем из available чтобы следующие поля не получили его
            const idx = availableKommoFields.findIndex(f => f.id === clm.field.id);
            if (idx >= 0) availableKommoFields.splice(idx, 1);
            matchMap[af.id] = { kf: clm.field, via: clm.via, score: clm.score };
          }
        }
      });
      // ────────────────────────────────────────────────────────────────────

      // Строим результат по группам, используя matchMap
      const groupsResult = sortedGroups.map(g => ({
        id: g.id,
        name: g.name,
        sort: g.sort,
        kommoGroupId: (() => {
          const n = (g.name || '').toLowerCase().trim();
          const mapped = AMO_KOMMO_GROUP_NAME_MAP[n] || n;
          return (kGroupByName[mapped] || kGroupByName[n] || null)?.id || null;
        })(),
        fields: g.fields.map(af => {
          summary.total++;

          if (skippedIds[entity + '_' + af.id]) {
            summary.skipped++;
            return { amo: af, kommo: null, status: 'skipped', differences: [], kommoFieldId: null, matchedVia: null };
          }

          const m  = matchMap[af.id];
          const kf = m?.kf || null;
          const via = m?.via || null;

          const cmp = compareFields(af, kf, entityMapping[af.id]);

          // Если тип не совпал — не показываем найденное Kommo-поле;
          // это поле будет создано с правильным типом (статус уже 'missing')
          const kommoDisplay = cmp.typeConflict ? null : kf;
          const effectiveVia = cmp.typeConflict ? null : via;

          // 'synced' = поле подтверждено (есть в маппинге) + точное совпадение.
          // До подтверждения точное совпадение = 'matched'. Частичное = 'partial'.
          const isConfirmed = !!entityMapping[af.id]?.kommoFieldId;
          const finalStatus = (cmp.exactMatch && isConfirmed) ? 'synced' : cmp.status;

          summary[finalStatus]++;

          return {
            amo: af,
            kommo: kommoDisplay,
            status: finalStatus,
            differences: cmp.differences,
            kommoFieldId: kommoDisplay?.id || null,
            matchedVia: effectiveVia,
            missingEnums: cmp.missingEnums || [],
            missingCount: cmp.missingCount || 0,
          };
        })
      }));

      result[entity] = {
        label: ENTITY_LABELS[entity],
        groups: groupsResult,
        amoGroupCount: sortedGroups.length,
        kommoFieldCount: kommoFields.length,
      };
    }

    // Сводная статистика
    res.json({ entities: result, summary, fieldMapping: existingMapping });

  } catch (e) {
    console.error('[fields-analysis]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /api/migration/create-field
 * Создаёт одно поле из AMO в Kommo по его ID и типу сущности.
 * Используется при ручном выборе поля в интерфейсе синхронизации.
 */
router.post('/create-field', async (req, res) => {
  try {
    const { entityType, amoFieldId, stageMapping: stageMappingOverride, fieldStatus } = req.body;
    if (!entityType || !amoFieldId) {
      return res.status(400).json({ ok: false, error: 'entityType and amoFieldId required' });
    }

    // ── ЗАЩИТА: запрещаем изменение полей с полным совпадением ──────────────
    // Если фронтенд передал статус 'matched' или 'synced' — поле уже есть в Kommo
    // и полностью совпадает. Изменение или пересоздание запрещено.
    if (fieldStatus === 'matched' || fieldStatus === 'synced') {
      logger.warn(`[create-field] BLOCKED: attempt to modify ${fieldStatus} field ${amoFieldId} (${entityType})`);
      return res.status(403).json({
        ok: false,
        blocked: true,
        fieldStatus,
        error: `⛔ Операция запрещена: поле уже существует в Kommo и полностью совпадает (статус: ${fieldStatus}). Изменение и пересоздание совпадающих полей не допускается.`,
      });
    }

    const fse   = require('fs-extra');
    const pathM = require('path');
    const cfg   = require('../config');
    const { buildCreatePayload, loadFieldMapping, saveFieldMapping } = require('../utils/fieldMapping');

    // Загружаем stageMapping для правила hidden_statuses
    const stagePath   = pathM.resolve(cfg.backupDir, 'stage_mapping.json');
    const stageMapping = stageMappingOverride ||
      (fse.existsSync(stagePath) ? fse.readJsonSync(stagePath) : {});
    const kommoPipelineId = cfg.kommo.pipelineId;

    // Получаем определение поля из AMO
    const amoFields = await amoApi.getCustomFields(entityType);
    const amoField  = amoFields.find(f => f.id === Number(amoFieldId));
    if (!amoField) return res.status(404).json({ ok: false, error: 'AMO field not found' });

    // Проверяем, нет ли уже такого поля в Kommo
    const kommoFields = await kommoApi.getCustomFields(entityType);
    const kByCode = {};
    const kByName = {};
    kommoFields.forEach(f => {
      if (f.code) kByCode[f.code.toUpperCase()] = f;
      kByName[(f.name || '').toLowerCase().trim()] = f;
    });
    let kf = amoField.code ? kByCode[amoField.code.toUpperCase()] : null;
    if (!kf) kf = kByName[(amoField.name || '').toLowerCase().trim()];

    if (kf) {
      // Поле уже существует в Kommo по code/name — проверяем типы
      if (amoField.type !== kf.type) {
        // Тип не совпадает — поле Kommo остаётся, создаём новое с суффиксом (amo)
        kf = null; // создадим ниже как новое
      } else if (ENUM_TYPES.includes(amoField.type)) {
        // Типы совпадают, enum-поле — добавляем недостающие значения AMO в Kommo (PATCH)
        const kValSet = new Set(
          (kf.enums || []).map(e => (e.value || '').toLowerCase().trim()).filter(Boolean)
        );
        const newEnumObjs = (amoField.enums || []).filter(
          e => e.value && !kValSet.has((e.value || '').toLowerCase().trim())
        );
        if (newEnumObjs.length > 0) {
          const maxSort = Math.max(0, ...(kf.enums || []).map(e => e.sort || 0));
          const patchPayload = {
            enums: [
              ...(kf.enums || []).map(e => ({ id: e.id, value: e.value, sort: e.sort })),
              ...newEnumObjs.map((e, i) => ({ value: e.value, sort: maxSort + (i + 1) * 10 })),
            ],
          };
          try {
            const patched = await kommoApi.patchCustomField(entityType, kf.id, patchPayload);
            const updated = patched || kf;
            // Обновляем маппинг
            const mapping = loadFieldMapping() || {};
            if (!mapping[entityType]) mapping[entityType] = {};
            mapping[entityType][amoField.id] = {
              kommoFieldId: updated.id,
              fieldType: amoField.type,
              enumMap: {},
            };
            saveFieldMapping(mapping);
            return res.json({ ok: true, kommoField: updated, patched: true, addedEnums: newEnumObjs.length });
          } catch (patchErr) {
            logger.error('[create-field] PATCH enums failed:', patchErr.response?.data || patchErr.message);
            return res.status(500).json({ ok: false, error: 'Не удалось обновить варианты поля: ' + patchErr.message });
          }
        }
        // Все AMO-значения уже есть — сохраняем маппинг и возвращаем
        {
          const mapping = loadFieldMapping() || {};
          if (!mapping[entityType]) mapping[entityType] = {};
          if (!mapping[entityType][amoField.id]) {
            mapping[entityType][amoField.id] = { kommoFieldId: kf.id, fieldType: amoField.type, enumMap: {} };
            saveFieldMapping(mapping);
          }
        }
        return res.json({ ok: true, kommoField: kf, alreadyExisted: true });
      } else {
        // Типы совпадают, не enum — сохраняем маппинг
        {
          const mapping = loadFieldMapping() || {};
          if (!mapping[entityType]) mapping[entityType] = {};
          if (!mapping[entityType][amoField.id]) {
            mapping[entityType][amoField.id] = { kommoFieldId: kf.id, fieldType: amoField.type, enumMap: {} };
            saveFieldMapping(mapping);
          }
        }
        return res.json({ ok: true, kommoField: kf, alreadyExisted: true });
      }
    }

    // Определяем группу для нового поля
    let targetGroupId = null;
    let groupCreated = null;
    try {
      const amoGroups = amoApi.getCustomFieldGroups
        ? await amoApi.getCustomFieldGroups(entityType)
        : [];
      const amoGroup = amoField.group_id
        ? amoGroups.find(g => g.id === amoField.group_id)
        : null;
      if (amoGroup) {
        const groupNameLc = (amoGroup.name || '').toLowerCase().trim();
        const mappedName  = AMO_KOMMO_GROUP_NAME_MAP[groupNameLc] || groupNameLc;
        const cacheKey    = entityType + ':' + groupNameLc;

        // 1. Проверяем заполненный кэш (предыдущий запрос уже завершил создание)
        if (createdGroupCache[cacheKey]) {
          targetGroupId = createdGroupCache[cacheKey];
          logger.info(`[create-field] Reusing cached group "${amoGroup.name}" id=${targetGroupId}`);
        } else if (groupCreationPending[cacheKey]) {
          // 2. Race condition guard: другой параллельный запрос уже создаёт эту группу — ждём его
          logger.info(`[create-field] Waiting for in-flight group creation "${amoGroup.name}"...`);
          targetGroupId = await groupCreationPending[cacheKey];
        } else {
          // 3. Мы первые — создаём группу и регистрируем Promise, чтобы параллельные запросы ждали нас
          const creationPromise = (async () => {
            try {
              const kommoGroups = await kommoApi.getCustomFieldGroups(entityType);
              const kGroupByName = {};
              kommoGroups.forEach(g => { kGroupByName[(g.name || '').toLowerCase().trim()] = g; });
              let kommoGroup = kGroupByName[mappedName] || kGroupByName[groupNameLc] || null;

              if (!kommoGroup) {
                const newGroup = await kommoApi.createCustomFieldGroup(entityType, {
                  name: amoGroup.name,
                  sort: amoGroup.sort || 100,
                });
                if (newGroup) {
                  kommoGroup = newGroup;
                  groupCreated = { name: amoGroup.name, id: newGroup.id };
                  logger.info(`[create-field] Created Kommo group "${amoGroup.name}" for ${entityType}, id=${newGroup.id}`);
                }
              } else {
                logger.info(`[create-field] Found existing Kommo group "${amoGroup.name}" id=${kommoGroup.id}`);
              }

              const resolvedId = kommoGroup ? kommoGroup.id : null;
              if (resolvedId) createdGroupCache[cacheKey] = resolvedId;
              return resolvedId;
            } finally {
              // Убираем из pending в любом случае (успех или ошибка)
              delete groupCreationPending[cacheKey];
            }
          })();

          groupCreationPending[cacheKey] = creationPromise;
          targetGroupId = await creationPromise;
        }
      }
    } catch (groupErr) {
      logger.warn('[create-field] Could not resolve group:', groupErr.message);
    }

    // Создаём поле через API Kommo
    const payload = buildCreatePayload(amoField, stageMapping, kommoPipelineId);
    if (targetGroupId) payload.group_id = targetGroupId;

    // Системные group_id Kommo (только для tracking_data). Нельзя помещать туда другие типы.
    // 'statistic' = Statistics, 'default' = Main (реальный system group_id в Kommo = 'default')
    const KOMMO_SYSTEM_GROUPS = new Set(['statistic', 'default', 'main']);

    let created = null;
    try {
      created = await kommoApi.createCustomField(entityType, payload);
    } catch (createErr) {
      const httpStatus = createErr.response?.status;
      if (httpStatus === 400 && payload.type === 'tracking_data') {
        // Попытка 1: некоторые коды с ведущим _ не принимаются Kommo (напр. _YM_UID).
        // Убираем ведущие подчёркивания из code и повторяем как tracking_data.
        const origCode = payload.code || '';
        const sanitizedCode = origCode.replace(/^_+/, '');
        if (sanitizedCode && sanitizedCode !== origCode) {
          logger.warn(`[create-field] tracking_data 400 for "${amoField.name}" code="${origCode}", retry with sanitized code="${sanitizedCode}"`);
          try {
            created = await kommoApi.createCustomField(entityType, { ...payload, code: sanitizedCode });
          } catch (_) { /* fall through to text fallback */ }
        }

        // Попытка 2: создаём как text-поле.
        // Системные группы (statistic, main) допускают только tracking_data — убираем group_id.
        if (!created) {
          const fallbackPayload = { ...payload, type: 'text' };
          delete fallbackPayload.code;
          if (KOMMO_SYSTEM_GROUPS.has(fallbackPayload.group_id)) {
            logger.warn(`[create-field] tracking_data fallback for "${amoField.name}": removed system group_id="${fallbackPayload.group_id}", creating as text (ungrouped)`);
            delete fallbackPayload.group_id;
          } else {
            logger.warn(`[create-field] tracking_data fallback for "${amoField.name}": creating as text in same group`);
          }
          created = await kommoApi.createCustomField(entityType, fallbackPayload);
        }
      } else {
        throw createErr;
      }
    }
    if (!created) return res.status(500).json({ ok: false, error: 'Failed to create field in Kommo' });

    // Обновляем маппинг на диске
    const mapping = loadFieldMapping() || {};
    if (!mapping[entityType]) mapping[entityType] = {};
    const enumMap = {};
    if (amoField.enums && created.enums) {
      amoField.enums.forEach((ae, idx) => {
        if (created.enums[idx]) enumMap[ae.id] = created.enums[idx].id;
      });
    }
    mapping[entityType][amoField.id] = { kommoFieldId: created.id, fieldType: amoField.type, enumMap };
    saveFieldMapping(mapping);

    res.json({ ok: true, kommoField: created, amoFieldId: amoField.id, groupCreated });
  } catch (e) {
    console.error('[create-field]', e);
    res.status(500).json({ ok: false, error: e.message, details: e.response?.data });
  }
});

/**
 * POST /api/migration/skip-field
 * Помечает поле как пропущенное — оно не будет участвовать в последующей обработке.
 */
router.post('/skip-field', async (req, res) => {
  try {
    const { entityType, amoFieldId } = req.body;
    if (!entityType || !amoFieldId) {
      return res.status(400).json({ ok: false, error: 'entityType and amoFieldId required' });
    }
    const fse   = require('fs-extra');
    const pathM = require('path');
    const cfg   = require('../config');
    const skipPath = pathM.resolve(cfg.backupDir, 'skipped_fields.json');
    const skipped  = fse.existsSync(skipPath) ? fse.readJsonSync(skipPath) : {};
    skipped[entityType + '_' + amoFieldId] = true;
    fse.writeJsonSync(skipPath, skipped, { spaces: 2 });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * DELETE /api/migration/skip-field
 * Снимает отметку "пропущено" с поля — возвращает его в список обработки.
 */
router.delete('/skip-field', async (req, res) => {
  try {
    const { entityType, amoFieldId } = req.body;
    const fse   = require('fs-extra');
    const pathM = require('path');
    const cfg   = require('../config');
    const skipPath = pathM.resolve(cfg.backupDir, 'skipped_fields.json');
    const skipped  = fse.existsSync(skipPath) ? fse.readJsonSync(skipPath) : {};
    delete skipped[entityType + '_' + amoFieldId];
    fse.writeJsonSync(skipPath, skipped, { spaces: 2 });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ── Safety Guard status ─────────────────────────────────────────────── */
router.get('/safety-status', (req, res) => {
  try {
    const guard = require('../utils/safetyGuard');
    res.json({
      ok: true,
      stats: guard.getSafetyStats(),
      recentBlocked: guard.getBlockedAttempts(20),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ── Reset safety index (admin only) ────────────────────────────────── */
router.post('/safety-reset', (req, res) => {
  try {
    const guard = require('../utils/safetyGuard');
    guard.resetIndex();
    res.json({ ok: true, message: 'Индекс миграции сброшен. При следующем запуске данные будут созданы заново.' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
