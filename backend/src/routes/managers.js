/**
 * GET /api/managers
 * Returns users from "Международный ОП" AMO group,
 * enriched with their Kommo counterpart (by email mapping).
 */
const express = require('express');
const router = express.Router();
const amo   = require('../services/amoApiV2');
const { DEFAULT_USER_MAP, FALLBACK_KOMMO_EMAIL } = require('../services/copyService');

router.get('/', async (req, res) => {
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
});

module.exports = router;
