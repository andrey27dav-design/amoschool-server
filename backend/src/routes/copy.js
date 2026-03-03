const path = require('path');
const fs = require('fs');
/**
 * Copy route — POST starts copy, GET streams SSE progress.
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const {
  registerSSE,
  unregisterSSE,
  copySessionDeals,
} = require('../services/copyService');
const { sendReport } = require('../services/emailService');

// GET /api/copy/:id/stream — SSE stream for real-time progress
router.get('/:id/stream', (req, res) => {
  const sessionId = req.params.id;

  if (!db.getSession(sessionId)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  registerSSE(sessionId, res);

  // Send heartbeat every 20s to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unregisterSSE(sessionId);
  });
});

// POST /api/copy/:id/start — start copying deals for session
router.post('/:id/start', async (req, res) => {
  const sessionId = req.params.id;
  const session = db.getSession(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  if (session.status !== 'fetched') {
    return res.status(400).json({
      error: `Сессия должна быть в статусе 'fetched' (текущий: ${session.status})`,
    });
  }

  // Acknowledge immediately; copy runs in background => SSE for progress
  res.json({ status: 'started', session_id: sessionId });

  copySessionDeals(sessionId, req.body.user_map || null)
    .then(async (result) => {
      // Send email report after completion
      await sendReport(sessionId).catch((e) =>
        db.log(sessionId, 'warn', `Email report failed: ${e.message}`)
      );
    })
    .catch((err) => {
      db.log(sessionId, 'error', `Copy background error: ${err.message}`);
    });
});

// GET /api/copy/totals — accumulated counts from safetyGuard migration_index.json
router.get('/totals', (req, res) => {
  try {
    const cfg = require('../config');
    const indexPath = path.resolve(cfg.backupDir, 'migration_index.json');
    const idx = fs.existsSync(indexPath)
      ? JSON.parse(fs.readFileSync(indexPath, 'utf8'))
      : {};
    const count = obj => Object.keys(obj || {}).length;
    const totals = {
      leads:     count(idx.leads),
      contacts:  count(idx.contacts),
      companies: count(idx.companies),
      tasks:     count(idx.tasks_leads) + count(idx.tasks_contacts) + count(idx.tasks_companies),
      notes:     count(idx.notes_leads) + count(idx.notes_contacts) + count(idx.notes_companies),
    };
    res.json(totals);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
