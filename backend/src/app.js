require('dotenv').config();
require('express-async-errors');

// Handle EPIPE and unhandledRejection to prevent PM2 crashes on client disconnect
process.on('uncaughtException', (err) => {
  if (err.code === 'EPIPE' || err.syscall === 'write') {
    return; // Client disconnected — ignore silently
  }
  console.error('[uncaughtException]', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

const path = require('path');
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

// Version endpoint — returns version + description from versions.js
app.get('/api/version', (req, res) => {
  const VERSIONS = require('./versions');
  let ver = 'unknown';
  try {
    const { execSync } = require('child_process');
    const msg = execSync('git -C /var/www/amoschool log -1 --format=%s', { encoding: 'utf8' }).trim();
    const match = msg.match(/^(V\d+\.\d+\.\d+)/);
    ver = match ? match[1] : msg.slice(0, 20);
  } catch (e) {
    try {
      ver = fs.readFileSync(path.join(__dirname, '../../VERSION'), 'utf8').trim();
    } catch (_) {}
  }
  res.json({ version: ver });
});

// Changelog endpoint — returns full version history for "Версии" tab
app.get('/api/version/changelog', (req, res) => {
  const VERSIONS = require('./versions');
  // Clear require cache so versions.js changes take effect on restart
  delete require.cache[require.resolve('./versions')];
  res.json(require('./versions'));
});

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
