require('dotenv').config();

module.exports = {
  amo: {
    token: process.env.AMO_TOKEN,
    baseUrl: process.env.AMO_BASE_URL,
    pipelineId: parseInt(process.env.AMO_PIPELINE_ID),
  },
  kommo: {
    token: process.env.KOMMO_TOKEN,
    baseUrl: process.env.KOMMO_BASE_URL,
    pipelineId: parseInt(process.env.KOMMO_PIPELINE_ID),
  },
  port: parseInt(process.env.PORT) || 3001,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  backupDir: process.env.BACKUP_DIR || require('path').resolve(__dirname, '../../backups'),
};
