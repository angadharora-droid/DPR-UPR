import nodemailer from 'nodemailer';
import User from '../models/User.js';

function buildTransport(auth) {
  if (!process.env.SMTP_HOST) {
    // Dev mode: no SMTP configured — emails are rendered to JSON and logged.
    return nodemailer.createTransport({ jsonTransport: true });
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth:
      auth ||
      (process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined),
  });
}

export async function getPurchaseHead() {
  return User.findOne({ role: 'purchase_head', active: true }).sort({ createdAt: 1 });
}

export async function getPurchaseHeadEmail() {
  const ph = await getPurchaseHead();
  return ph?.email || process.env.PURCHASE_HEAD_EMAIL || null;
}

// When the unit has its own mailbox configured (Admin → Units), authenticate and
// send as that mailbox — the From must match the authenticated user on most hosts.
export async function sendUprEmail({ to, subject, text, attachmentPath, attachmentName, unit }) {
  const unitAuth =
    unit?.smtpUser && unit?.smtpPass ? { user: unit.smtpUser, pass: unit.smtpPass } : null;
  const transport = buildTransport(unitAuth);
  const from = unitAuth
    ? { name: `CPH Requisitions — ${unit.name}`, address: unit.smtpUser }
    : process.env.MAIL_FROM || 'no-reply@cph.local';
  const info = await transport.sendMail({
    from,
    to,
    subject,
    text,
    attachments: attachmentPath ? [{ filename: attachmentName, path: attachmentPath }] : [],
  });
  const devMode = !process.env.SMTP_HOST;
  if (devMode) console.log('[mailer:dev] email not actually sent (no SMTP_HOST). To:', to, 'Subject:', subject);
  return { devMode, messageId: info.messageId };
}
