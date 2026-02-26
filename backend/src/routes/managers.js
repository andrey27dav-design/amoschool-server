/**
 * Managers routes:
 * GET  /api/managers           — AMO managers from "Международный ОП" group
 * GET  /api/managers/kommo-users — all Kommo CRM users
 * GET  /api/managers/mapping   — saved amo→kommo user mappings
 * POST /api/managers/match     — save / update a manager pairing
 * DELETE /api/managers/match/:amoUserId — remove pairing
 */
const express = require('express');
const router = express.Router();
const amo   = require('../services/amoApiV2');
const kommo = require('../services/kommoApiV2');
const db    = require('../db');
const { DEFAULT_USER_MAP, FALLBACK_KOMMO_EMAIL } = require('../services/copyService');

// GET /api/managers
router.get('/', async (req, res) => {
  try {
    const amoUsers = await amo.getMezhdunarodniyOPUsers();
    const result = amoUsers.map((u) => {
      const mapping = DEFAULT_USER_MAP.find(
        (m) => m.amoEmail?.toLowerCase() === u.email?.toLowerCase()
      );
      return {
        amo_id: u.id,
        amo_name: u.name,
        amo_email: u.email,
        kommo_email: mapping?.kommoEmail || FALLBACK_KOMMO_EMAIL,
        is_fallback: !mapping,
      };
    });
    res.json({ managers: result });
  } catch (e) {
    console.error('GET /managers error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/managers/kommo-users
router.get('/kommo-users', async (req, res) => {
  try {
    const users = await kommo.getUsers();
    const list = (Array.isArray(users) ? users : users?._embedded?.users || users || [])
      .map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role_id: u.role_id,
        group_id: u.group_id,
        is_active: u.is_active !== false,
      }));
    res.json({ users: list });
  } catch (e) {
    console.error('GET /managers/kommo-users error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/managers/mapping
router.get('/mapping', async (req, res) => {
  try {
    const mappings = db.getUserMappings();
    res.json({ mappings });
  } catch (e) {
    console.error('GET /managers/mapping error:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/managers/match
// Body: { amo_user_id, amo_user_name, amo_email, kommo_user_id, kommo_user_name, kommo_email }
router.post('/match', async (req, res) => {
  try {
    const { amo_user_id, amo_user_name, amo_email, kommo_user_id, kommo_user_name, kommo_email } = req.body;
    if (!amo_user_id || !kommo_user_id) {
      return res.status(400).json({ error: 'amo_user_id and kommo_user_id are required' });
    }
    db.saveUserMapping({ amo_user_id, amo_user_name, amo_email, kommo_user_id, kommo_user_name, kommo_email });
    res.json({ ok: true });
  } catch (e) {
    console.error('POST /managers/match error:', e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/managers/match/:amoUserId
router.delete('/match/:amoUserId', async (req, res) => {
  try {
    db.deleteUserMapping(parseInt(req.params.amoUserId));
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /managers/match error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
