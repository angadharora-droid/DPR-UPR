import AuditLog from '../models/AuditLog.js';

export async function logAudit({ entityType, entityId, action, changedBy, oldValue = null, newValue = null }) {
  try {
    await AuditLog.create({ entityType, entityId, action, changedBy, oldValue, newValue });
  } catch (err) {
    console.error('audit log failed:', err.message);
  }
}
