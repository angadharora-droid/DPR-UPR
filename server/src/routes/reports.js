import { Router } from 'express';
import Unit from '../models/Unit.js';
import Department from '../models/Department.js';
import Dpr from '../models/Dpr.js';
import Upr from '../models/Upr.js';
import AuditLog from '../models/AuditLog.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { todayCycle } from './dpr.js';

const router = Router();
router.use(authRequired);

// Cross-unit overview for Admin (and Purchase Head): today's status per unit
router.get('/overview', requireRole('admin', 'purchase_head'), async (req, res, next) => {
  try {
    const cycleDate = todayCycle();
    const units = await Unit.find({ active: true }).sort({ name: 1 });
    const [departments, dprs, uprs] = await Promise.all([
      Department.find({ active: true }).select('unit name'),
      Dpr.find({ cycleDate }).select('unit department status'),
      Upr.find({ cycleDate }).select('unit status sentAt sentToEmail'),
    ]);
    const dprKey = new Map(dprs.map((d) => [`${d.unit}:${d.department}`, d.status]));
    const uprByUnit = new Map(uprs.map((u) => [String(u.unit), u]));
    res.json({
      cycleDate,
      units: units.map((u) => ({
        id: u._id,
        name: u.name,
        city: u.city,
        departments: departments
          .filter((d) => String(d.unit) === String(u._id))
          .map((d) => ({ name: d.name, dprStatus: dprKey.get(`${u._id}:${d._id}`) || 'pending' })),
        uprStatus: uprByUnit.get(String(u._id))?.status || 'pending',
        uprSentAt: uprByUnit.get(String(u._id))?.sentAt || null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// Audit trail for an entity (admin + unit head)
router.get('/audit', requireRole('admin', 'unit_head'), async (req, res, next) => {
  try {
    const q = {};
    if (req.query.entityType) q.entityType = req.query.entityType;
    if (req.query.entityId) q.entityId = req.query.entityId;
    const logs = await AuditLog.find(q)
      .populate('changedBy', 'name role')
      .sort({ timestamp: -1 })
      .limit(200);
    res.json(logs);
  } catch (err) {
    next(err);
  }
});

export default router;
