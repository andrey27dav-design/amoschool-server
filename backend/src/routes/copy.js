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

// GET /api/copy/totals — accumulated counts of all migrated entities across all sessions
router.get('/totals', (req, res) => {
  try {
    const stmt = db.db.prepare(`
      SELECT entity_type, COUNT(*) as cnt
      FROM id_mapping
      WHERE status = 'created'
      GROUP BY entity_type
    `);
    const rows = stmt.all();
    const totals = { leads: 0, contacts: 0, companies: 0, tasks: 0, notes: 0 };
    rows.forEach(r => {
      if (totals[r.entity_type] !== undefined) totals[r.entity_type] = r.cnt;
      else totals[r.entity_type] = r.cnt; // preserve unknown types too
    });
    res.json(totals);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
