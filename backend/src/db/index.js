/**
 * SQLite database for session management and ID mapping.
 * Stores: sessions, id_mapping, amo_cache, session_log
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs-extra');

const DB_PATH = path.join(__dirname, '../../../backups/migration.db');
fs.ensureDirSync(path.dirname(DB_PATH));

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ──────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    amo_user_id   INTEGER NOT NULL,
    amo_user_name TEXT,
    amo_user_email TEXT,
    kommo_user_id INTEGER NOT NULL,
    kommo_user_name TEXT,
    amo_pipeline_id   INTEGER NOT NULL,
    kommo_pipeline_id INTEGER NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending',
    -- pending | fetching | fetched | copying | completed | error | rolled_back
    total_deals   INTEGER DEFAULT 0,
    copied_deals  INTEGER DEFAULT 0,
    rolled_back   INTEGER DEFAULT 0,
    error_count   INTEGER DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    started_at    TEXT,
    completed_at  TEXT
  );

  CREATE TABLE IF NOT EXISTS id_mapping (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL REFERENCES sessions(id),
    entity_type TEXT NOT NULL,  -- contact | company | lead | task | note | call
    amo_id      INTEGER NOT NULL,
    kommo_id    INTEGER,
    status      TEXT NOT NULL DEFAULT 'pending',
    -- pending | created | skipped | error | rolled_back
    error_msg   TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(session_id, entity_type, amo_id)
  );

  CREATE TABLE IF NOT EXISTS amo_cache (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL REFERENCES sessions(id),
    entity_type TEXT NOT NULL,
    amo_id      INTEGER NOT NULL,
    data        TEXT NOT NULL,  -- JSON
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(session_id, entity_type, amo_id)
  );

  CREATE TABLE IF NOT EXISTS session_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    level      TEXT NOT NULL DEFAULT 'info',
    message    TEXT NOT NULL,
    details    TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_id_mapping_session ON id_mapping(session_id);
  CREATE INDEX IF NOT EXISTS idx_id_mapping_amo ON id_mapping(session_id, entity_type, amo_id);
  CREATE INDEX IF NOT EXISTS idx_amo_cache_session ON amo_cache(session_id, entity_type);
  CREATE INDEX IF NOT EXISTS idx_session_log ON session_log(session_id);
`);

// ─── Sessions ─────────────────────────────────────────────────────────────────
const createSession = db.prepare(`
  INSERT INTO sessions (amo_user_id, amo_user_name, amo_user_email,
    kommo_user_id, kommo_user_name, amo_pipeline_id, kommo_pipeline_id, status)
  VALUES (@amo_user_id, @amo_user_name, @amo_user_email,
    @kommo_user_id, @kommo_user_name, @amo_pipeline_id, @kommo_pipeline_id, @status)
`);

const getSession      = db.prepare('SELECT * FROM sessions WHERE id = ?');
const getAllSessions   = db.prepare(`SELECT * FROM sessions ORDER BY created_at DESC LIMIT 50`);
const updateSession   = db.prepare(`
  UPDATE sessions SET status=@status, total_deals=@total_deals,
    copied_deals=@copied_deals, rolled_back=@rolled_back,
    error_count=@error_count, started_at=@started_at, completed_at=@completed_at
  WHERE id=@id
`);
const patchSessionStatus = db.prepare(`UPDATE sessions SET status=? WHERE id=?`);

// ─── ID Mapping ───────────────────────────────────────────────────────────────
const upsertMapping = db.prepare(`
  INSERT INTO id_mapping (session_id, entity_type, amo_id, kommo_id, status, error_msg)
  VALUES (@session_id, @entity_type, @amo_id, @kommo_id, @status, @error_msg)
  ON CONFLICT(session_id, entity_type, amo_id) DO UPDATE SET
    kommo_id=excluded.kommo_id, status=excluded.status, error_msg=excluded.error_msg
`);

const getMapping = db.prepare(
  'SELECT * FROM id_mapping WHERE session_id=? AND entity_type=? AND amo_id=?'
);

const getSessionMappings = db.prepare(
  'SELECT * FROM id_mapping WHERE session_id=? AND entity_type=?'
);

const getCreatedMappings = db.prepare(
  `SELECT * FROM id_mapping WHERE session_id=? AND status='created' ORDER BY id DESC`
);

const rollbackMapping = db.prepare(
  `UPDATE id_mapping SET status='rolled_back' WHERE session_id=? AND entity_type=? AND amo_id=?`
);

const rollbackAllMappings = db.prepare(
  `UPDATE id_mapping SET status='rolled_back' WHERE session_id=? AND status='created'`
);

const getLastCreatedMappingStmt = db.prepare(
  `SELECT * FROM id_mapping WHERE session_id=? AND entity_type=? AND status='created' ORDER BY id DESC LIMIT 1`
);

const getMappingsByStatusStmt = db.prepare(
  `SELECT * FROM id_mapping WHERE session_id=? AND entity_type=? AND status=?`
);

const getMappingsCreatedAfterStmt = db.prepare(
  `SELECT * FROM id_mapping WHERE session_id=? AND entity_type=? AND id > ? AND status='created'`
);

// ─── AMO Cache ────────────────────────────────────────────────────────────────
const insertCache = db.prepare(`
  INSERT OR REPLACE INTO amo_cache (session_id, entity_type, amo_id, data)
  VALUES (@session_id, @entity_type, @amo_id, @data)
`);

const getCacheByType = db.prepare(
  'SELECT * FROM amo_cache WHERE session_id=? AND entity_type=? ORDER BY id'
);

const getCacheItem = db.prepare(
  'SELECT * FROM amo_cache WHERE session_id=? AND entity_type=? AND amo_id=?'
);

const countCacheByType = db.prepare(
  'SELECT COUNT(*) as cnt FROM amo_cache WHERE session_id=? AND entity_type=?'
);

// ─── Session Log ──────────────────────────────────────────────────────────────
const insertLog = db.prepare(`
  INSERT INTO session_log (session_id, level, message, details)
  VALUES (@session_id, @level, @message, @details)
`);

const getSessionLog = db.prepare(
  'SELECT * FROM session_log WHERE session_id=? ORDER BY id DESC LIMIT ?'
);

// ─── Exported helpers ─────────────────────────────────────────────────────────
function log(sessionId, level, message, details = null) {
  insertLog.run({
    session_id: sessionId,
    level,
    message,
    details: details ? JSON.stringify(details) : null,
  });
}

function cacheEntities(sessionId, entityType, items) {
  const insert = db.transaction((list) => {
    for (const item of list) {
      insertCache.run({
        session_id: sessionId,
        entity_type: entityType,
        amo_id: item.id,
        data: JSON.stringify(item),
      });
    }
  });
  insert(items);
}

function getCached(sessionId, entityType) {
  return getCacheByType.all(sessionId, entityType).map((r) => JSON.parse(r.data));
}

function countCached(sessionId, entityType) {
  return countCacheByType.get(sessionId, entityType).cnt;
}

function setMapping(sessionId, entityType, amoId, kommoId, status = 'created', errorMsg = null) {
  upsertMapping.run({ session_id: sessionId, entity_type: entityType, amo_id: amoId, kommo_id: kommoId, status, error_msg: errorMsg });
}

function resolveKommoId(sessionId, entityType, amoId) {
  const row = getMapping.get(sessionId, entityType, amoId);
  return row?.kommo_id || null;
}

module.exports = {
  db,
  // sessions
  createSession: (data) => {
    const info = createSession.run({ status: 'pending', ...data });
    return info.lastInsertRowid;
  },
  getSession: (id) => getSession.get(id),
  getAllSessions: () => getAllSessions.all(),
  updateSession: (data) => updateSession.run(data),
  patchSessionStatus: (id, status) => patchSessionStatus.run(status, id),
  // mapping
  setMapping,
  getMapping: (sid, type, amoId) => getMapping.get(sid, type, amoId),
  getSessionMappings: (sid, type) => getSessionMappings.all(sid, type),
  getCreatedMappings: (sid) => getCreatedMappings.all(sid),
  rollbackMapping: (sid, type, amoId) => rollbackMapping.run(sid, type, amoId),
  rollbackAllMappings: (sid) => rollbackAllMappings.run(sid),
  getLastCreatedMapping: (sid, type) => getLastCreatedMappingStmt.get(sid, type),
  getMappingsByStatus: (sid, type, status) => getMappingsByStatusStmt.all(sid, type, status),
  getMappingsCreatedAfter: (sid, type, afterId) => getMappingsCreatedAfterStmt.all(sid, type, afterId),
  resolveKommoId,
  // cache
  cacheEntities,
  getCached,
  countCached,
  getCacheItem: (sid, type, amoId) => {
    const r = getCacheItem.get(sid, type, amoId);
    return r ? JSON.parse(r.data) : null;
  },
  // log
  log,
  getSessionLog: (sid, limit = 100) => getSessionLog.all(sid, limit),
};
