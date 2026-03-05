'use strict';
// creds.js — единый источник доменов и ключей
// Читает из /var/www/amoschool/backend/.env
// Использование в скриптах: const { AMO_HOST, AMO_TOKEN, KOMMO_HOST, KOMMO_TOKEN, KOMMO_USER_ID } = require('./creds');

require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

const AMO_BASE_URL   = process.env.AMO_BASE_URL   || 'https://houch.amocrm.ru';
const KOMMO_BASE_URL = process.env.KOMMO_BASE_URL || 'https://helloshkolaonlinecom.kommo.com';

module.exports = {
  // AMO
  AMO_TOKEN   : process.env.AMO_TOKEN,
  AMO_BASE_URL,
  AMO_HOST    : AMO_BASE_URL.replace('https://', '').replace('http://', ''),
  AMO_PIPELINE_ID: Number(process.env.AMO_PIPELINE_ID || 3456421),

  // Kommo
  KOMMO_TOKEN   : process.env.KOMMO_TOKEN,
  KOMMO_BASE_URL,
  KOMMO_HOST    : KOMMO_BASE_URL.replace('https://', '').replace('http://', ''),
  KOMMO_PIPELINE_ID: Number(process.env.KOMMO_PIPELINE_ID || 13165644),
  KOMMO_USER_ID : 12739795,
};
