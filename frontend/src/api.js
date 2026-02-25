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

// AMO data loading
export const getAmoFetchStatus = () => api.get('/amo/fetch-status').then(r => r.data);
export const triggerAmoFetch = () => api.post('/amo/fetch').then(r => r.data);
export const getAmoEntities = (type, page = 1, limit = 50, search = '') =>
  api.get('/amo/entities', { params: { type, page, limit, search } }).then(r => r.data);
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
export const rollbackBatch = () => api.post('/migration/batch-rollback').then(r => r.data);
export const resetBatchOffset = () => api.post('/migration/batch-reset').then(r => r.data);
