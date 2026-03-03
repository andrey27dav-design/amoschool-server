/**
 * Copy route — POST starts copy, GET streams SSE progress.
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const path    = require('path');
const fse     = require('fs-extra');
const cfg     = require('../config');
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
      error: `Session status must be 'fetched' (current: ${session.status})`,
    });
  }

  res.json({ status: 'started', session_id: sessionId });

  copySessionDeals(sessionId, req.body.user_map || null)
    .then(async () => {
      await sendReport(sessionId).catch((e) =>
        db.log(sessionId, 'warn', `Email report failed: ${e.message}`)
      );
    })
    .catch((err) => {
      db.log(sessionId, 'error', `Copy background error: ${err.message}`);
    });
});

// Helper: count entries in a migration_index.json field
// The field can be: object {amo_id: kommo_id}, array, number, or missing
function countField(idx, key) {
  const val = idx[key];
  if (!val) return 0;
  if (Array.isArray(val)) return val.length;
  if (typeof val === 'number') return val;
  if (typeof val === 'object') return Object.keys(val).length;
  return 0;
}

// GET /api/copy/totals — read from migration_index.json minus baseline
// migration_index.json is the permanent dedup record — NEVER cleared
// counter_reset_baseline.json stores the snapshot at last "reset counter" click
router.get('/totals', (req, res) => {
  try {
    const indexPath    = path.resolve(cfg.backupDir, 'migration_index.json');
    const baselinePath = path.resolve(cfg.backupDir, 'counter_reset_baseline.json');

    const idx  = fse.existsSync(indexPath)    ? fse.readJsonSync(indexPath)    : {};
    const base = fse.existsSync(baselinePath) ? fse.readJsonSync(baselinePath) : {};

    const totals = {
      leads:     Math.max(0, countField(idx, 'leads')     - (base.leads     || 0)),
      contacts:  Math.max(0, countField(idx, 'contacts')  - (base.contacts  || 0)),
      companies: Math.max(0, countField(idx, 'companies') - (base.companies || 0)),
      tasks:     Math.max(0,
        (countField(idx, 'tasks_leads') + countField(idx, 'tasks_contacts') + countField(idx, 'tasks_companies'))
        - (base.tasks || 0)
      ),
      notes:     Math.max(0,
        (countField(idx, 'notes_leads') + countField(idx, 'notes_contacts') + countField(idx, 'notes_companies'))
        - (base.notes || 0)
      ),
    };

    res.json(totals);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/copy/reset-counter — save current totals as display baseline
// NEVER modifies migration_index.json — only writes counter_reset_baseline.json
router.post('/reset-counter', (req, res) => {
  try {
    const indexPath    = path.resolve(cfg.backupDir, 'migration_index.json');
    const baselinePath = path.resolve(cfg.backupDir, 'counter_reset_baseline.json');

    const idx = fse.existsSync(indexPath) ? fse.readJsonSync(indexPath) : {};

    const baseline = {
      leads:     countField(idx, 'leads'),
      contacts:  countField(idx, 'contacts'),
      companies: countField(idx, 'companies'),
      tasks:     countField(idx, 'tasks_leads') + countField(idx, 'tasks_contacts') + countField(idx, 'tasks_companies'),
      notes:     countField(idx, 'notes_leads') + countField(idx, 'notes_contacts') + countField(idx, 'notes_companies'),
      resetAt:   new Date().toISOString(),
    };

    fse.writeJsonSync(baselinePath, baseline, { spaces: 2 });

    res.json({ ok: true, baseline });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
