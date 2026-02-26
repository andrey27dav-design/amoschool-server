/**
 * Session management routes.
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { fetchSessionData, getSessionPreview } = require('../services/copyService');
const { rollbackLastDeal, rollbackSession }   = require('../services/rollbackService');

// GET /api/sessions — list all sessions
router.get('/', (req, res) => {
  const sessions = db.getAllSessions();
  res.json({ sessions });
});

// POST /api/sessions/fetch — create new session and fetch AMO data
router.post('/fetch', async (req, res) => {
  const {
    amo_pipeline_id,
    amo_user_id,
    kommo_pipeline_id,
    kommo_user_id,
    // Optional manager name fields for display
    amo_user_name,
    kommo_user_name,
  } = req.body;

  if (!amo_pipeline_id || !amo_user_id || !kommo_pipeline_id || !kommo_user_id) {
    return res.status(400).json({
      error: 'Обязательные параметры: amo_pipeline_id, amo_user_id, kommo_pipeline_id, kommo_user_id',
    });
  }

  const sessionId = db.createSession({
    amo_user_id: Number(amo_user_id),
    amo_user_name: amo_user_name || '',
    amo_user_email: '',
    kommo_user_id: Number(kommo_user_id),
    kommo_user_name: kommo_user_name || '',
    amo_pipeline_id: Number(amo_pipeline_id),
    kommo_pipeline_id: Number(kommo_pipeline_id),
  });

  res.json({ session_id: sessionId, status: 'fetching' });

  // Run fetch in background (progress via SSE)
  fetchSessionData(sessionId).catch((err) => {
    db.log(sessionId, 'error', `Background fetch failed: ${err.message}`);
  });
});

// GET /api/sessions/:id — session details
router.get('/:id', (req, res) => {
  const session = db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({ session });
});

// GET /api/sessions/:id/preview — full preview data for modal
router.get('/:id/preview', (req, res) => {
  const preview = getSessionPreview(req.params.id);
  if (!preview) return res.status(404).json({ error: 'Session not found' });
  res.json(preview);
});

// GET /api/sessions/:id/log — session log entries
router.get('/:id/log', (req, res) => {
  const limit  = Number(req.query.limit)  || 100;
  const offset = Number(req.query.offset) || 0;
  const logs = db.getSessionLog(req.params.id, limit, offset);
  res.json({ logs });
});

// POST /api/sessions/:id/rollback-last — rollback last copied deal
router.post('/:id/rollback-last', async (req, res) => {
  const result = await rollbackLastDeal(req.params.id);
  res.json(result);
});

// POST /api/sessions/:id/rollback-session — rollback entire session
router.post('/:id/rollback-session', async (req, res) => {
  const result = await rollbackSession(req.params.id);
  res.json(result);
});

module.exports = router;
