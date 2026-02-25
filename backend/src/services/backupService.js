const fs = require('fs-extra');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

async function ensureBackupDir() {
  await fs.ensureDir(config.backupDir);
}

function getBackupPath(name) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(config.backupDir, `${name}_${timestamp}.json`);
}

async function saveBackup(name, data) {
  await ensureBackupDir();
  const filePath = getBackupPath(name);
  await fs.writeJson(filePath, data, { spaces: 2 });
  logger.info(`Backup saved: ${filePath} (${JSON.stringify(data).length} bytes)`);
  return filePath;
}

async function loadBackup(filePath) {
  if (!await fs.pathExists(filePath)) {
    throw new Error(`Backup file not found: ${filePath}`);
  }
  return fs.readJson(filePath);
}

async function listBackups() {
  await ensureBackupDir();
  const files = await fs.readdir(config.backupDir);
  const backups = [];

  for (const file of files.filter((f) => f.endsWith('.json'))) {
    const filePath = path.join(config.backupDir, file);
    const stat = await fs.stat(filePath);
    backups.push({
      file,
      path: filePath,
      size: stat.size,
      created: stat.birthtime,
    });
  }

  return backups.sort((a, b) => new Date(b.created) - new Date(a.created));
}

async function createFullBackup(data) {
  const backupData = {
    timestamp: new Date().toISOString(),
    source: 'amo CRM',
    target: 'Kommo CRM',
    leads: data.leads || [],
    contacts: data.contacts || [],
    companies: data.companies || [],
    tasks: data.tasks || [],
    pipeline: data.pipeline || null,
  };

  const filePath = await saveBackup('full_backup', backupData);
  return { filePath, stats: {
    leads: backupData.leads.length,
    contacts: backupData.contacts.length,
    companies: backupData.companies.length,
    tasks: backupData.tasks.length,
  }};
}

module.exports = {
  saveBackup,
  loadBackup,
  listBackups,
  createFullBackup,
};
