import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'https://wisper.aikonver.ru/api';

const api = axios.create({ baseURL: API_BASE });

export const getMigrationStatus = () => api.get('/migration/status').then(r => r.data);
export const startMigration = () => api.post('/migration/start').then(r => r.data);
export const rollbackMigration = (steps) => api.post('/migration/rollback', { steps }).then(r => r.data);
export const syncStages = (amoPipelineId, kommoPipelineId) =>
  api.post('/migration/sync-stages', { amoPipelineId, kommoPipelineId }).then(r => r.data);
export const getBackups = () => api.get('/migration/backups').then(r => r.data);
export const getAmoPipelines = () => api.get('/pipelines/amo').then(r => r.data);
export const getKommoPipelines = () => api.get('/pipelines/kommo').then(r => r.data);
export const getHealth = () => api.get('/health').then(r => r.data);

// Stage mapping persistence
export const getStageMappingDB = (amoPipelineId, kommoPipelineId) =>
  api.get('/pipelines/stage-mapping', { params: { amoPipelineId, kommoPipelineId } }).then(r => r.data);
export const saveStageMappingDB = (amoPipelineId, kommoPipelineId, stages) =>
  api.post('/pipelines/stage-mapping', { amoPipelineId, kommoPipelineId, stages }).then(r => r.data);

// AMO data loading
export const getAmoFetchStatus = () => api.get('/amo/fetch-status').then(r => r.data);
export const triggerAmoFetch = (pipelineId, managerIds) =>
  api.post('/amo/fetch', { pipelineId: pipelineId || null, managerIds: managerIds || [] }).then(r => r.data);
export const getAmoEntities = (type, page = 1, limit = 50, search = '', managersOnly = false, managerIds = []) =>
  api.get('/amo/entities', { params: { type, page, limit, search, managersOnly: managersOnly ? '1' : '0', managerIds: managerIds.join(',') } }).then(r => r.data);
export const getAmoStats = () => api.get('/amo/stats').then(r => r.data);

// Fields sync
export const getFieldsAnalysis = () => api.get('/migration/fields-analysis').then(r => r.data);
export const createField = (entity, amoFieldId, status) =>
  api.post('/migration/create-field', { entityType: entity, amoFieldId, fieldStatus: status }).then(r => r.data);
export const skipField = (entity, amoFieldId) =>
  api.post('/migration/skip-field', { entityType: entity, amoFieldId }).then(r => r.data);

// Batch migration
export const analyzeManagers = () => api.get('/migration/analyze-managers').then(r => r.data);
export const getBatchConfig = () => api.get('/migration/batch-config').then(r => r.data);
export const setBatchConfig = (cfg) => api.post('/migration/batch-config', cfg).then(r => r.data);
export const getBatchStatus = () => api.get('/migration/batch-status').then(r => r.data);
export const getBatchStats = () => api.get('/migration/batch-stats').then(r => r.data);
export const startBatch = () => api.post('/migration/batch-start').then(r => r.data);
export const pauseBatch = () => api.post('/migration/batch-pause').then(r => r.data);
export const rollbackBatch = () => api.post('/migration/batch-rollback').then(r => r.data);
export const resetBatchOffset = () => api.post('/migration/batch-reset').then(r => r.data);

// ── Manager matching ─────────────────────────────────────────────────────────
export const getAmoManagers = () => api.get('/managers').then(r => r.data);
export const getKommoUsers = () => api.get('/managers/kommo-users').then(r => r.data);
export const getManagerMapping = () => api.get('/managers/mapping').then(r => r.data);
export const matchManager = (data) => api.post('/managers/match', data).then(r => r.data);
export const deleteManagerMatch = (amoUserId) => api.delete(`/managers/match/${amoUserId}`).then(r => r.data);

// ── Copy engine API ──────────────────────────────────────────────────────────
export const getManagers = () => api.get('/managers').then(r => r.data);
export const getSessions = () => api.get('/sessions').then(r => r.data);
export const getSession  = (id) => api.get(`/sessions/${id}`).then(r => r.data);
export const getSessionPreview = (id) => api.get(`/sessions/${id}/preview`).then(r => r.data);
export const getSessionLog = (id, limit = 100) => api.get(`/sessions/${id}/log`, { params: { limit } }).then(r => r.data);
export const fetchSessionDeals = (params) => api.post('/sessions/fetch', params).then(r => r.data);
export const startCopySession  = (id, userMap = null) => api.post(`/copy/${id}/start`, { user_map: userMap }).then(r => r.data);
export const rollbackLastDeal  = (id) => api.post(`/sessions/${id}/rollback-last`).then(r => r.data);
export const rollbackSession   = (id) => api.post(`/sessions/${id}/rollback-session`).then(r => r.data);

// ── Single / selective deal transfer ────────────────────────────────────────
export const getDealsList    = () => api.get('/migration/deals-list').then(r => r.data);
export const transferDeals   = (leadIds, stageMapping) =>
  api.post('/migration/transfer-deals', { leadIds, stageMapping }).then(r => r.data);
