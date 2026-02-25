/**
 * safetyGuard.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Центральный модуль безопасности для миграции AMO → Kommo.
 *
 * ПРАВИЛА (нарушение любого = полная остановка + предупреждение):
 *  1. Данные AMO CRM НИКОГДА не удаляются и не изменяются автоматически.
 *     Удаление выполняется вручную оператором ПОСЛЕ подтверждения миграции.
 *  2. Существующие данные Kommo CRM НЕ перезаписываются данными AMO.
 *     Разрешено только ДОБАВЛЕНИЕ новых записей (POST), но не ОБНОВЛЕНИЕ (PATCH/PUT/DELETE).
 *  3. Enum-значения в полях Kommo — только аддитивное добавление (новые значения),
 *     удаление и переименование существующих значений запрещено.
 *  4. Этапы воронки Kommo — только добавление новых, изменение существующих запрещено.
 *  5. Каждый перенесённый объект (сделка/контакт/компания) регистрируется
 *     в постоянном индексе. Повторная попытка переноса того же объекта блокируется.
 */
'use strict';

const fs     = require('fs-extra');
const path   = require('path');
const logger = require('./logger');

// Загружаем config через require с абсолютным путём чтобы работало и из /tmp
let config;
try {
  config = require('../config');
} catch {
  config = { backupDir: path.resolve(__dirname, '../../backups') };
}

const INDEX_FILE   = path.resolve(config.backupDir, 'migration_index.json');
const BLOCKED_LOG  = path.resolve(config.backupDir, 'blocked_attempts.json');

// ─── Ошибка безопасности ──────────────────────────────────────────────────────
class SafetyError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name    = 'SafetyError';
    this.code    = code || 'SAFETY_BLOCKED';
    this.details = details || null;
    this.isSafetyError = true;
  }
}

// ─── Индекс миграции (AMO id → Kommo id) ─────────────────────────────────────
function loadIndex() {
  try {
    if (fs.existsSync(INDEX_FILE)) return fs.readJsonSync(INDEX_FILE);
  } catch (e) {
    logger.warn('[safetyGuard] Cannot read migration index:', e.message);
  }
  return { leads: {}, contacts: {}, companies: {} };
}

function saveIndex(idx) {
  try {
    fs.ensureDirSync(path.dirname(INDEX_FILE));
    fs.writeJsonSync(INDEX_FILE, idx, { spaces: 2 });
  } catch (e) {
    logger.error('[safetyGuard] Cannot save migration index:', e.message);
  }
}

// ─── Лог заблокированных попыток ─────────────────────────────────────────────
function logBlockedAttempt(entity, amoId, kommoId, reason) {
  try {
    fs.ensureDirSync(path.dirname(BLOCKED_LOG));
    const list = fs.existsSync(BLOCKED_LOG) ? fs.readJsonSync(BLOCKED_LOG) : [];
    list.push({ timestamp: new Date().toISOString(), entity, amoId, kommoId, reason });
    // Ограничиваем 500 записями, удаляем самые старые
    const trimmed = list.length > 500 ? list.slice(list.length - 500) : list;
    fs.writeJsonSync(BLOCKED_LOG, trimmed, { spaces: 2 });
  } catch {}
}

// ─── Регистрация успешно перенесённых объектов ────────────────────────────────
/**
 * Зарегистрировать пару {amoId → kommoId} после успешного создания в Kommo.
 * @param {string} entity — 'leads' | 'contacts' | 'companies'
 * @param {number|string} amoId
 * @param {number|string} kommoId
 */
function registerMigrated(entity, amoId, kommoId) {
  const idx = loadIndex();
  if (!idx[entity]) idx[entity] = {};
  idx[entity][String(amoId)] = String(kommoId);
  saveIndex(idx);
}

/**
 * Зарегистрировать пакет пар [{amoId, kommoId}].
 * @param {string} entity
 * @param {Array<{amoId, kommoId}>} pairs
 */
function registerMigratedBatch(entity, pairs) {
  const idx = loadIndex();
  if (!idx[entity]) idx[entity] = {};
  for (const { amoId, kommoId } of pairs) {
    if (amoId && kommoId) {
      idx[entity][String(amoId)] = String(kommoId);
    }
  }
  saveIndex(idx);
}

// ─── Фильтрация уже перенесённых объектов ────────────────────────────────────
/**
 * Разделить массив items на toCreate (новые) и skipped (уже перенесены).
 * @param {string} entity
 * @param {Array} items      — исходный массив объектов AMO
 * @param {Function} getAmoId — функция, извлекающая AMO id из объекта
 * @returns {{ toCreate: Array, skipped: Array<{item, kommoId, reason}> }}
 */
function filterNotMigrated(entity, items, getAmoId) {
  const idx = loadIndex();
  const entityIdx = idx[entity] || {};
  const toCreate  = [];
  const skipped   = [];

  for (const item of items) {
    const amoId  = String(getAmoId(item));
    const kommoId = entityIdx[amoId];
    if (kommoId) {
      const reason = `${entity} AMO#${amoId} уже перенесён → Kommo#${kommoId}`;
      skipped.push({ item, amoId, kommoId, reason });
      logBlockedAttempt(entity, amoId, kommoId, 'Дублирующий перенос заблокирован');
      logger.warn(`[safetyGuard] SKIP DUPLICATE: ${reason}`);
    } else {
      toCreate.push(item);
    }
  }

  if (skipped.length > 0) {
    logger.info(`[safetyGuard] filterNotMigrated(${entity}): ${toCreate.length} новых, ${skipped.length} пропущено (уже перенесены)`);
  }
  return { toCreate, skipped };
}

// ─── Защита enum-значений: только аддитивное добавление ──────────────────────
/**
 * Вернуть только те значения из newEnums, которых ещё нет в существующих enums Kommo.
 * Удаление и переименование существующих значений ЗАПРЕЩЕНО — возвращается полный
 * список (старые + новые) для PATCH.
 *
 * @param {Array} existingKommoEnums  — текущие enums из Kommo (объекты { id, value, sort })
 * @param {Array} candidateEnums      — кандидаты на добавление (объекты { value })
 * @returns {{ patchEnums: Array, addedValues: string[], blockedDeletions: string[] }}
 */
function prepareAdditiveEnumPatch(existingKommoEnums, candidateEnums) {
  const existing = existingKommoEnums || [];
  const candidates = candidateEnums || [];

  const existingNorm = new Set(
    existing.map(e => (e.value || '').toLowerCase().trim()).filter(Boolean)
  );
  const newOnly = candidates.filter(
    e => e.value && !existingNorm.has((e.value || '').toLowerCase().trim())
  );

  const maxSort = existing.length > 0
    ? Math.max(...existing.map(e => e.sort || 0))
    : 0;

  // Полный список для PATCH = все старые (сохраняем id!) + только новые
  const patchEnums = [
    ...existing.map(e => ({ id: e.id, value: e.value, sort: e.sort })),
    ...newOnly.map((e, i) => ({ value: e.value, sort: maxSort + (i + 1) * 10 })),
  ];

  return {
    patchEnums,
    addedValues:      newOnly.map(e => e.value),
    blockedDeletions: [], // мы никогда не удаляем существующие значения
  };
}

// ─── Блокировка записи в AMO ──────────────────────────────────────────────────
/**
 * Вызывать перед любой попыткой записи в AMO CRM.
 * В нормальном режиме работы AMO CRM — только источник данных (readonly).
 */
function blockAmoWrite(operation) {
  const msg =
    `⛔ БЛОКИРОВКА БЕЗОПАСНОСТИ: операция "${operation}" по изменению данных AMO CRM ЗАПРЕЩЕНА. ` +
    `AMO CRM является источником данных (только чтение). ` +
    `Данные AMO удаляются вручную оператором ПОСЛЕ успешной проверки миграции.`;
  logger.error('[safetyGuard] AMO write blocked:', operation);
  throw new SafetyError(msg, 'AMO_WRITE_BLOCKED', { operation });
}

// ─── Блокировка перезаписи существующих данных Kommo ─────────────────────────
/**
 * Вызывать перед PATCH/PUT на существующий объект Kommo, чтобы убедиться,
 * что мы не перезаписываем данные, которые уже существовали в Kommo до миграции.
 *
 * @param {string} entityType — 'leads' | 'contacts' | 'companies' | 'custom_field' и др.
 * @param {number} kommoId    — id объекта в Kommo
 * @param {string} [field]    — имя поля, которое пытаемся изменить (для диагностики)
 */
function blockKommoOverwrite(entityType, kommoId, field) {
  const msg =
    `⛔ БЛОКИРОВКА БЕЗОПАСНОСТИ: попытка перезаписать существующий объект ${entityType} #${kommoId}` +
    (field ? ` (поле: "${field}")` : '') +
    `. Перезапись данных Kommo данными AMO ЗАПРЕЩЕНА. ` +
    `Разрешено только добавление новых записей.`;
  logBlockedAttempt(entityType, null, kommoId, `Попытка перезаписать ${field || 'данные'}`);
  logger.error('[safetyGuard] Kommo overwrite blocked:', entityType, kommoId, field);
  throw new SafetyError(msg, 'KOMMO_OVERWRITE_BLOCKED', { entityType, kommoId, field });
}

// ─── Проверка перед удалением из Kommo ───────────────────────────────────────
/**
 * Проверить, что удаляемые из Kommo объекты — это только те, что мы сами только
 * что создали (есть в createdIds), а не ранее существовавшие данные.
 * Используется при откате (rollback).
 *
 * @param {string} entity       — 'leads' | 'contacts' | 'companies'
 * @param {number[]} idsToDelete — список Kommo ID для удаления
 * @param {number[]} createdIds  — список Kommo ID созданных в текущем пакете
 * @returns {{ safe: number[], blocked: number[] }}
 */
function validateRollbackIds(entity, idsToDelete, createdIds) {
  const created = new Set((createdIds || []).map(Number));
  const safe    = [];
  const blocked = [];

  for (const id of idsToDelete) {
    if (created.has(Number(id))) {
      safe.push(id);
    } else {
      blocked.push(id);
      logBlockedAttempt(entity, null, id, 'Попытка удалить не созданный нами объект в откате');
      logger.warn(`[safetyGuard] ROLLBACK BLOCKED: ${entity} #${id} не является объектом текущего пакета`);
    }
  }

  if (blocked.length > 0) {
    logger.warn(`[safetyGuard] validateRollbackIds: ${blocked.length} объектов заблокировано от удаления`);
  }
  return { safe, blocked };
}

// ─── Статистика ───────────────────────────────────────────────────────────────
function getSafetyStats() {
  const idx = loadIndex();
  let blockedAttempts = 0;
  try {
    const list = fs.existsSync(BLOCKED_LOG) ? fs.readJsonSync(BLOCKED_LOG) : [];
    blockedAttempts = list.length;
  } catch {}

  return {
    migratedLeads:     Object.keys(idx.leads    || {}).length,
    migratedContacts:  Object.keys(idx.contacts || {}).length,
    migratedCompanies: Object.keys(idx.companies|| {}).length,
    blockedAttempts,
    indexFile:   INDEX_FILE,
    blockedFile: BLOCKED_LOG,
  };
}

function getBlockedAttempts(limit = 50) {
  try {
    const list = fs.existsSync(BLOCKED_LOG) ? fs.readJsonSync(BLOCKED_LOG) : [];
    return list.slice(-limit).reverse();
  } catch { return []; }
}

/**
 * Полностью сбросить индекс миграции (использовать с осторожностью — только при
 * повторном переносе с чистого листа после ручного удаления данных из Kommo).
 */
function resetIndex() {
  const blank = { leads: {}, contacts: {}, companies: {} };
  saveIndex(blank);
  logger.warn('[safetyGuard] Migration index RESET by operator');
  return blank;
}

module.exports = {
  SafetyError,
  // Регистрация
  registerMigrated,
  registerMigratedBatch,
  // Фильтрация
  filterNotMigrated,
  // Enum protection
  prepareAdditiveEnumPatch,
  // Блокировки
  blockAmoWrite,
  blockKommoOverwrite,
  validateRollbackIds,
  // Статистика
  getSafetyStats,
  getBlockedAttempts,
  resetIndex,
  loadIndex,
};
