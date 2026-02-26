require('dotenv').config();
require('express-async-errors');
const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const config = require('./config');
const logger = require('./utils/logger');

const migrationRoutes = require('./routes/migration');
const pipelineRoutes  = require('./routes/pipelines');
const dataRoutes      = require('./routes/data');

// New copy-engine routes
const managersRoutes  = require('./routes/managers');
const sessionsRoutes  = require('./routes/sessions');
const copyRoutes      = require('./routes/copy');

const app = express();

// Ensure directories exist
fs.ensureDirSync('logs');
fs.ensureDirSync(config.backupDir);

// Initialize SQLite DB
require('./db');

app.use(cors({ origin: config.frontendUrl }));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// ── Existing routes ──────────────────────────────────────────
app.use('/api/migration', migrationRoutes);
app.use('/api/pipelines', pipelineRoutes);
app.use('/api/amo',       dataRoutes);

// ── New copy-engine routes ───────────────────────────────────
app.use('/api/managers',  managersRoutes);
app.use('/api/sessions',  sessionsRoutes);
app.use('/api/copy',      copyRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    amo: { baseUrl: config.amo.baseUrl, pipelineId: config.amo.pipelineId },
    kommo: { baseUrl: config.kommo.baseUrl, pipelineId: config.kommo.pipelineId },
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(500).json({
    error: err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

app.listen(config.port, () => {
  logger.info(`CRM Migration Server started on port ${config.port}`);
  logger.info(`AMO: ${config.amo.baseUrl} pipeline ${config.amo.pipelineId}`);
  logger.info(`Kommo: ${config.kommo.baseUrl} pipeline ${config.kommo.pipelineId}`);
});

module.exports = app;
