import nodemailer from 'nodemailer';
import User from '../models/User.js';

function buildTransport() {
  if (!process.env.SMTP_HOST) {
    // Dev mode: no SMTP configured — emails are rendered to JSON and logged.
    return nodemailer.createTransport({ jsonTransport: true });
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

export async function getPurchaseHeadEmail() {
  const ph = await User.findOne({ role: 'purchase_head', active: true }).sort({ createdAt: 1 });
  return ph?.email || process.env.PURCHASE_HEAD_EMAIL || null;
}

export async function sendUprEmail({ to, subject, text, attachmentPath, attachmentName }) {
  const transport = buildTransport();
  const info = await transport.sendMail({
    from: process.env.MAIL_FROM || 'no-reply@cph.local',
    to,
    subject,
    text,
    attachments: attachmentPath ? [{ filename: attachmentName, path: attachmentPath }] : [],
  });
  const devMode = !process.env.SMTP_HOST;
  if (devMode) console.log('[mailer:dev] email not actually sent (no SMTP_HOST). To:', to, 'Subject:', subject);
  return { devMode, messageId: info.messageId };
}
