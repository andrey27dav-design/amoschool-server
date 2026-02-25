const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const path = require('path');
const amoApi = require('../services/amoApi');
const config = require('../config');
const logger = require('../utils/logger');

const CACHE_FILE = path.resolve(config.backupDir, 'amo_data_cache.json');

// fetchState: idle | loading | done | error
let fetchState = {
  status: 'idle',
  progress: { step: '', loaded: { leads: 0, contacts: 0, companies: 0, tasks: 0 } },
  error: null,
  updatedAt: null,
};

// In-memory cache for quick reads
let memCache = null;

function loadCacheFromDisk() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      memCache = fs.readJsonSync(CACHE_FILE);
      return memCache;
    } catch (e) {
      return null;
    }
  }
  return null;
}

// Background fetch all amo CRM data
async function fetchAllData() {
  if (fetchState.status === 'loading') return;

  fetchState = {
    status: 'loading',
    progress: { step: 'Инициализация...', loaded: { leads: 0, contacts: 0, companies: 0, tasks: 0 } },
    error: null,
    updatedAt: null,
  };
  memCache = null;

  try {
    fetchState.progress.step = 'Загрузка сделок...';
    const leads = await amoApi.getAllLeads(config.amo.pipelineId);
    fetchState.progress.loaded.leads = leads.length;
    logger.info(`Data fetch: loaded ${leads.length} leads`);

    fetchState.progress.step = 'Загрузка контактов...';
    const contacts = await amoApi.getAllContacts();
    fetchState.progress.loaded.contacts = contacts.length;
    logger.info(`Data fetch: loaded ${contacts.length} contacts`);

    fetchState.progress.step = 'Загрузка компаний...';
    const companies = await amoApi.getAllCompanies();
    fetchState.progress.loaded.companies = companies.length;
    logger.info(`Data fetch: loaded ${companies.length} companies`);

    fetchState.progress.step = 'Загрузка задач...';
    const tasks = await amoApi.getAllTasks();
    fetchState.progress.loaded.tasks = tasks.length;
    logger.info(`Data fetch: loaded ${tasks.length} tasks`);

    const data = {
      fetchedAt: new Date().toISOString(),
      counts: {
        leads: leads.length,
        contacts: contacts.length,
        companies: companies.length,
        tasks: tasks.length,
      },
      leads,
      contacts,
      companies,
      tasks,
    };

    await fs.writeJson(CACHE_FILE, data, { spaces: 2 });
    memCache = data;

    fetchState.status = 'done';
    fetchState.progress.step = 'Готово';
    fetchState.updatedAt = data.fetchedAt;
    logger.info('Data fetch completed and saved to cache');
  } catch (err) {
    fetchState.status = 'error';
    fetchState.error = err.message;
    fetchState.progress.step = 'Ошибка';
    logger.error(`Data fetch error: ${err.message}`);
  }
}

// GET /api/amo/fetch-status — current fetch status
router.get('/fetch-status', (req, res) => {
  // Check if cache exists but state is idle
  if (fetchState.status === 'idle' && !memCache) {
    loadCacheFromDisk();
    if (memCache) {
      fetchState.status = 'done';
      fetchState.updatedAt = memCache.fetchedAt;
      fetchState.progress.loaded = memCache.counts;
    }
  }
  res.json(fetchState);
});

// POST /api/amo/fetch — trigger background data load
router.post('/fetch', (req, res) => {
  if (fetchState.status === 'loading') {
    return res.json({ message: 'Загрузка уже выполняется', state: fetchState });
  }
  fetchAllData(); // fire and forget
  res.json({ message: 'Загрузка данных запущена', state: fetchState });
});

// GET /api/amo/entities?type=leads&page=1&limit=50&search=
router.get('/entities', (req, res) => {
  if (!memCache) loadCacheFromDisk();
  if (!memCache) return res.status(404).json({ error: 'Данные не загружены. Запустите загрузку.' });

  const { type = 'leads', page = 1, limit = 50, search = '' } = req.query;
  const validTypes = ['leads', 'contacts', 'companies', 'tasks'];
  if (!validTypes.includes(type)) return res.status(400).json({ error: 'Неверный тип сущности' });

  let items = memCache[type] || [];

  // Search filter
  if (search) {
    const q = search.toLowerCase();
    items = items.filter((item) => {
      const name = (item.name || '').toLowerCase();
      return name.includes(q);
    });
  }

  const total = items.length;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const start = (pageNum - 1) * limitNum;
  const paginated = items.slice(start, start + limitNum);

  res.json({
    type,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum),
    items: paginated,
    fetchedAt: memCache.fetchedAt,
  });
});

// GET /api/amo/stats — entity counts
router.get('/stats', (req, res) => {
  if (!memCache) loadCacheFromDisk();
  if (!memCache) return res.json({ counts: null, fetchedAt: null });
  res.json({ counts: memCache.counts, fetchedAt: memCache.fetchedAt });
});

module.exports = router;
