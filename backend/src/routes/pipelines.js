const express = require('express');
const router = express.Router();
const amoApi = require('../services/amoApi');
const kommoApi = require('../services/kommoApi');
const db = require('../db');

// GET /api/pipelines/amo
router.get('/amo', async (req, res) => {
  const pipelines = await amoApi.getPipelines();
  res.json(pipelines);
});

// GET /api/pipelines/kommo
router.get('/kommo', async (req, res) => {
  const pipelines = await kommoApi.getPipelines();
  res.json(pipelines);
});

// GET /api/pipelines/amo/:id/stages
router.get('/amo/:id/stages', async (req, res) => {
  const pipeline = await amoApi.getPipeline(parseInt(req.params.id));
  res.json(pipeline._embedded?.statuses || []);
});

// GET /api/pipelines/kommo/:id/stages
router.get('/kommo/:id/stages', async (req, res) => {
  const stages = await kommoApi.getPipelineStatuses(parseInt(req.params.id));
  res.json(stages);
});

// GET /api/pipelines/stage-mapping?amoPipelineId=X&kommoPipelineId=Y
router.get('/stage-mapping', async (req, res) => {
  try {
    const { amoPipelineId, kommoPipelineId } = req.query;
    if (!amoPipelineId || !kommoPipelineId) {
      return res.status(400).json({ error: 'amoPipelineId and kommoPipelineId are required' });
    }
    const rows = db.getStageMapping(parseInt(amoPipelineId), parseInt(kommoPipelineId));
    res.json({ stages: rows });
  } catch (e) {
    console.error('GET stage-mapping error:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/pipelines/stage-mapping
// Body: { amoPipelineId, kommoPipelineId, stages: [{amo_stage_id, kommo_stage_id, amo_stage_name, kommo_stage_name}] }
router.post('/stage-mapping', async (req, res) => {
  try {
    const { amoPipelineId, kommoPipelineId, stages } = req.body;
    if (!amoPipelineId || !kommoPipelineId || !Array.isArray(stages)) {
      return res.status(400).json({ error: 'amoPipelineId, kommoPipelineId and stages[] are required' });
    }
    db.saveStageMapping(parseInt(amoPipelineId), parseInt(kommoPipelineId), stages);
    res.json({ ok: true, saved: stages.length });
  } catch (e) {
    console.error('POST stage-mapping error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
