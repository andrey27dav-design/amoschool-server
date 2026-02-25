const express = require('express');
const router = express.Router();
const amoApi = require('../services/amoApi');
const kommoApi = require('../services/kommoApi');

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

module.exports = router;
