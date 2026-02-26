/**
 * Email report service using nodemailer.
 * Sends HTML summary to andrey.27.dav@gmail.com after successful migration session.
 */
const nodemailer = require('nodemailer');
const db = require('../db');
const logger = require('../utils/logger');

const REPORT_EMAIL = 'andrey.27.dav@gmail.com';

function buildHtmlReport(session, preview) {
  const { summary, logs } = preview;
  const sessionDate = new Date(session.created_at).toLocaleString('ru-RU');
  const completedDate = session.completed_at
    ? new Date(session.completed_at).toLocaleString('ru-RU')
    : '—';

  const logRows = (logs || [])
    .slice(-30)
    .map(
      (l) =>
        `<tr style="background:${l.level === 'error' ? '#fff0f0' : l.level === 'warn' ? '#fffbe6' : 'white'}">
          <td style="padding:4px 8px;color:#888;font-size:11px">${new Date(l.created_at).toLocaleTimeString('ru-RU')}</td>
          <td style="padding:4px 8px;font-weight:bold;font-size:11px;color:${l.level === 'error' ? '#c00' : l.level === 'warn' ? '#960' : '#060'}">${l.level.toUpperCase()}</td>
          <td style="padding:4px 8px;font-size:12px">${l.message}</td>
        </tr>`
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><title>Миграция CRM — отчёт</title></head>
<body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px;color:#333">
  <h2 style="color:#2c5ab3">Отчёт о миграции AMO → Kommo</h2>

  <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
    <tr><td style="padding:6px 0;color:#666">Сессия</td><td><b>${session.id}</b></td></tr>
    <tr><td style="padding:6px 0;color:#666">Запущена</td><td>${sessionDate}</td></tr>
    <tr><td style="padding:6px 0;color:#666">Завершена</td><td>${completedDate}</td></tr>
    <tr><td style="padding:6px 0;color:#666">Статус</td>
      <td><b style="color:${session.status === 'completed' ? 'green' : 'red'}">${session.status}</b></td>
    </tr>
  </table>

  <h3 style="margin-top:24px">Итоги</h3>
  <table style="border-collapse:collapse;margin-bottom:20px">
    <tr>
      <td style="padding:8px 20px;background:#e8f4fd;border-radius:4px;text-align:center">
        <div style="font-size:28px;font-weight:bold;color:#2c5ab3">${summary.total_leads}</div>
        <div style="font-size:12px;color:#666">Сделок всего</div>
      </td>
      <td style="width:12px"></td>
      <td style="padding:8px 20px;background:#e8f5e9;border-radius:4px;text-align:center">
        <div style="font-size:28px;font-weight:bold;color:#2e7d32">${summary.copied}</div>
        <div style="font-size:12px;color:#666">Скопировано</div>
      </td>
      <td style="width:12px"></td>
      <td style="padding:8px 20px;background:#fff8e1;border-radius:4px;text-align:center">
        <div style="font-size:28px;font-weight:bold;color:#e65100">${summary.skipped}</div>
        <div style="font-size:12px;color:#666">Пропущено</div>
      </td>
      <td style="width:12px"></td>
      <td style="padding:8px 20px;background:#ffebee;border-radius:4px;text-align:center">
        <div style="font-size:28px;font-weight:bold;color:#c62828">${summary.errors}</div>
        <div style="font-size:12px;color:#666">Ошибок</div>
      </td>
    </tr>
  </table>

  <h3 style="margin-top:24px">Лог (последние 30 записей)</h3>
  <table style="width:100%;border-collapse:collapse;border:1px solid #eee;font-size:12px">
    <thead>
      <tr style="background:#f5f5f5">
        <th style="padding:6px 8px;text-align:left">Время</th>
        <th style="padding:6px 8px;text-align:left">Уровень</th>
        <th style="padding:6px 8px;text-align:left">Сообщение</th>
      </tr>
    </thead>
    <tbody>${logRows}</tbody>
  </table>

  <p style="margin-top:30px;color:#888;font-size:12px">
    Данные в AMO CRM не были изменены или удалены. Это отчёт является информационным.
  </p>
</body>
</html>`;
}

async function sendReport(sessionId) {
  const session = db.getSession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const { getSessionPreview } = require('./copyService');
  const preview = getSessionPreview(sessionId);

  const html = buildHtmlReport(session, preview);

  // Configure transporter (uses environment variables, or Gmail App Password)
  const transporter = nodemailer.createTransporter({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_USER || 'andrey.27.dav@gmail.com',
      pass: process.env.SMTP_PASS || '',
    },
  });

  const status = session.status === 'completed' ? 'Успешно' : 'С ошибками';
  const subject = `[CRM Migration] Сессия ${sessionId} — ${status} | ${new Date().toLocaleDateString('ru-RU')}`;

  try {
    const info = await transporter.sendMail({
      from: `"CRM Migration" <${process.env.SMTP_USER || 'andrey.27.dav@gmail.com'}>`,
      to: REPORT_EMAIL,
      subject,
      html,
    });
    logger.info(`Email report sent: ${info.messageId}`);
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    logger.error(`Failed to send email report: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

module.exports = { sendReport };
