const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const path = require('path');
const amoApi = require('../services/amoApi');
const config = require('../config');
const logger = require('../utils/logger');

const CACHE_FILE = path.resolve(config.backupDir, 'amo_data_cache.json');

// fetchState: idle | loading | done | error
const EMPTY_LOADED = () => ({
  leads: 0, contacts: 0, companies: 0,
  leadTasks: 0, contactTasks: 0,
  leadNotes: 0, contactNotes: 0,
});
let fetchState = {
  status: 'idle',
  progress: { step: '', loaded: EMPTY_LOADED() },
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
async function fetchAllData(pipelineId, managerIds) {
  if (fetchState.status === 'loading') return;

  const effectivePipelineId = pipelineId || config.amo.pipelineId;
  const effectiveManagerIds = Array.isArray(managerIds) && managerIds.length > 0
    ? managerIds.map(Number).filter(Boolean)
    : [];

  fetchState = {
    status: 'loading',
    progress: {
      step: 'Инициализация...',
      loaded: EMPTY_LOADED(),
      pipelineId: effectivePipelineId,
      managerIds: effectiveManagerIds,
    },
    error: null,
    updatedAt: null,
  };
  memCache = null;

  try {
    fetchState.progress.step = 'Загрузка сделок...';
    let leads = await amoApi.getAllLeads(effectivePipelineId);
    // Filter by managers if specified
    if (effectiveManagerIds.length > 0) {
      const before = leads.length;
      const idSet = new Set(effectiveManagerIds);
      leads = leads.filter(l => idSet.has(l.responsible_user_id));
      logger.info(`Data fetch: manager filter applied — ${before} → ${leads.length} leads (managers: [${effectiveManagerIds.join(',')}])`);
    }
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

    fetchState.progress.step = 'Загрузка задач (deals)...';
    const leadTasks = await amoApi.getAllLeadTasks();
    fetchState.progress.loaded.leadTasks = leadTasks.length;
    logger.info(`Data fetch: loaded ${leadTasks.length} lead tasks`);

    fetchState.progress.step = 'Загрузка задач (contacts)...';
    const contactTasks = await amoApi.getAllContactTasks();
    fetchState.progress.loaded.contactTasks = contactTasks.length;
    logger.info(`Data fetch: loaded ${contactTasks.length} contact tasks`);

    fetchState.progress.step = 'Загрузка комментариев (deals)...';
    const leadNotes = await amoApi.getAllLeadNotes();
    fetchState.progress.loaded.leadNotes = leadNotes.length;
    logger.info(`Data fetch: loaded ${leadNotes.length} lead notes`);

    fetchState.progress.step = 'Загрузка комментариев (contacts)...';
    const contactNotes = await amoApi.getAllContactNotes();
    fetchState.progress.loaded.contactNotes = contactNotes.length;
    logger.info(`Data fetch: loaded ${contactNotes.length} contact notes`);

    const data = {
      fetchedAt: new Date().toISOString(),
      pipelineId: effectivePipelineId,
      managerIds: effectiveManagerIds,
      counts: {
        leads: leads.length,
        contacts: contacts.length,
        companies: companies.length,
        leadTasks: leadTasks.length,
        contactTasks: contactTasks.length,
        leadNotes: leadNotes.length,
        contactNotes: contactNotes.length,
      },
      leads,
      contacts,
      companies,
      leadTasks,
      contactTasks,
      leadNotes,
      contactNotes,
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
      // Normalize: handle old cache format that used 'tasks' instead of leadTasks/contactTasks
      const c = memCache.counts || {};
      fetchState.progress.loaded = {
        leads: c.leads || 0,
        contacts: c.contacts || 0,
        companies: c.companies || 0,
        leadTasks: c.leadTasks ?? c.tasks ?? 0,
        contactTasks: c.contactTasks ?? 0,
        leadNotes: c.leadNotes ?? 0,
        contactNotes: c.contactNotes ?? 0,
      };
    }
  }
  res.json(fetchState);
});

// POST /api/amo/fetch — trigger background data load
router.post('/fetch', (req, res) => {
  if (fetchState.status === 'loading') {
    return res.json({ message: 'Загрузка уже выполняется', state: fetchState });
  }
  const { pipelineId, managerIds } = req.body || {};
  fetchAllData(pipelineId, managerIds); // fire and forget
  res.json({ message: 'Загрузка данных запущена', state: fetchState });
});

// GET /api/amo/entities?type=leads&page=1&limit=50&search=
router.get('/entities', (req, res) => {
  if (!memCache) loadCacheFromDisk();
  if (!memCache) return res.status(404).json({ error: 'Данные не загружены. Запустите загрузку.' });

  const { type = 'leads', page = 1, limit = 50, search = '', managersOnly = '0', managerIds = '' } = req.query;
  const validTypes = ['leads', 'contacts', 'companies', 'tasks', 'leadTasks', 'contactTasks', 'leadNotes', 'contactNotes'];
  if (!validTypes.includes(type)) return res.status(400).json({ error: 'Invalid type' });

  let items = memCache[type] || [];

  // Manager filter (only for leads)
  if (type === 'leads' && managersOnly === '1' && managerIds) {
    const ids = managerIds.split(',').map(Number).filter(Boolean);
    if (ids.length > 0) {
      items = items.filter(item => ids.includes(item.responsible_user_id));
    }
  }

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
