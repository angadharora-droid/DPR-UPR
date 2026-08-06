import { Router } from 'express';
import mongoose from 'mongoose';
import Unit from '../models/Unit.js';
import Department from '../models/Department.js';
import Dpr from '../models/Dpr.js';
import Upr from '../models/Upr.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { todayCycle } from './dpr.js';

const router = Router();
router.use(authRequired);

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

// from/to as YYYY-MM-DD; defaults to the last 30 days ending today.
function rangeFromQuery(req) {
  let to = DATE_RX.test(req.query.to || '') ? req.query.to : todayCycle();
  let from = DATE_RX.test(req.query.from || '') ? req.query.from : '';
  if (!from) {
    const d = new Date(to + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 29);
    from = d.toISOString().slice(0, 10);
  }
  if (from > to) [from, to] = [to, from];
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  return { from, to, days };
}

function reportUnitId(req) {
  return req.user.role === 'admin' ? req.query.unitId : req.user.unit;
}

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
    const dprKey = new Map(dprs.map((d) => [`${d.unit}:${d.department}`, d]));
    const uprByUnit = new Map(uprs.map((u) => [String(u.unit), u]));
    res.json({
      cycleDate,
      units: units.map((u) => ({
        id: u._id,
        name: u.name,
        city: u.city,
        departments: departments
          .filter((d) => String(d.unit) === String(u._id))
          .map((d) => {
            const dpr = dprKey.get(`${u._id}:${d._id}`);
            return { name: d.name, dprStatus: dpr?.status || 'pending', dprId: dpr?._id || null };
          }),
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

// Unit reports for the Unit Head (admin passes ?unitId=): ordering summary,
// department discipline, top items and category breakdown over a date range.
// "Ordered" figures read from verified/sent UPRs — the signed source of truth.
router.get('/unit', requireRole('unit_head', 'admin'), async (req, res, next) => {
  try {
    const unitId = reportUnitId(req);
    if (!unitId) return res.status(400).json({ error: 'unitId required' });
    const { from, to, days } = rangeFromQuery(req);
    const oid = new mongoose.Types.ObjectId(String(unitId));
    const inRange = { unit: oid, cycleDate: { $gte: from, $lte: to } };
    const uprMatch = { ...inRange, status: { $in: ['verified', 'sent'] } };

    const [cycleDates, deptAgg, depts, uprAgg, topItems, categories, unitUsers] = await Promise.all([
      Dpr.distinct('cycleDate', inRange),
      Dpr.aggregate([
        { $match: { ...inRange, status: 'submitted' } },
        { $group: {
            _id: '$department',
            submittedDays: { $addToSet: '$cycleDate' },
            lines: { $sum: { $size: '$lines' } },
            lastSubmitted: { $max: '$cycleDate' },
        } },
      ]),
      Department.find({ unit: unitId }).select('name active'),
      Upr.aggregate([
        { $match: inRange },
        { $group: { _id: '$status', n: { $sum: 1 }, lines: { $sum: { $size: '$lines' } } } },
      ]),
      Upr.aggregate([
        { $match: uprMatch },
        { $unwind: '$lines' },
        { $match: { 'lines.requiredQty': { $gt: 0 } } },
        { $group: {
            _id: { name: { $toLower: '$lines.itemName' }, uom: '$lines.uom' },
            name: { $last: '$lines.itemName' },
            uom: { $last: '$lines.uom' },
            category: { $last: '$lines.categoryName' },
            totalQty: { $sum: '$lines.requiredQty' },
            cycles: { $addToSet: '$cycleDate' },
        } },
        { $project: { _id: 0, name: 1, uom: 1, category: 1, totalQty: 1, timesOrdered: { $size: '$cycles' } } },
        { $sort: { timesOrdered: -1, totalQty: -1 } },
        { $limit: 25 },
      ]),
      Upr.aggregate([
        { $match: uprMatch },
        { $unwind: '$lines' },
        { $group: {
            _id: { $ifNull: [{ $cond: [{ $eq: ['$lines.categoryName', ''] }, 'Other', '$lines.categoryName'] }, 'Other'] },
            lines: { $sum: 1 },
            items: { $addToSet: { $toLower: '$lines.itemName' } },
        } },
        { $project: { _id: 0, name: '$_id', lines: 1, items: { $size: '$items' } } },
        { $sort: { lines: -1 } },
      ]),
      User.find({ unit: unitId }).select('_id'),
    ]);

    const edits = await AuditLog.aggregate([
      { $match: {
          action: { $in: ['unit-head-edit', 'unit-head-add', 'unit-head-remove'] },
          changedBy: { $in: unitUsers.map((u) => u._id) },
          timestamp: { $gte: new Date(from + 'T00:00:00.000Z'), $lte: new Date(to + 'T23:59:59.999Z') },
      } },
      { $group: { _id: '$action', n: { $sum: 1 } } },
    ]);

    const deptById = new Map(deptAgg.map((d) => [String(d._id), d]));
    const uprBy = new Map(uprAgg.map((u) => [u._id, u]));
    const editBy = new Map(edits.map((e) => [e._id, e.n]));
    res.json({
      from,
      to,
      days,
      summary: {
        activeCycleDays: cycleDates.length,
        dprsSubmitted: deptAgg.reduce((s, d) => s + d.submittedDays.length, 0),
        uprsVerified: uprBy.get('verified')?.n || 0,
        uprsSent: uprBy.get('sent')?.n || 0,
        itemsOrdered: (uprBy.get('verified')?.lines || 0) + (uprBy.get('sent')?.lines || 0),
        unitHeadEdits: {
          edited: editBy.get('unit-head-edit') || 0,
          added: editBy.get('unit-head-add') || 0,
          removed: editBy.get('unit-head-remove') || 0,
        },
      },
      departments: depts
        .filter((d) => d.active)
        .map((d) => {
          const s = deptById.get(String(d._id));
          return {
            name: d.name,
            submittedDays: s ? s.submittedDays.length : 0,
            lines: s ? s.lines : 0,
            lastSubmitted: s ? s.lastSubmitted : null,
          };
        })
        .sort((a, b) => b.submittedDays - a.submittedDays || a.name.localeCompare(b.name)),
      topItems,
      categories,
    });
  } catch (err) {
    next(err);
  }
});

// Per-cycle order history for one item — drill-down from the top-items report.
router.get('/item-history', requireRole('unit_head', 'admin'), async (req, res, next) => {
  try {
    const unitId = reportUnitId(req);
    if (!unitId) return res.status(400).json({ error: 'unitId required' });
    const name = String(req.query.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name required' });
    const { from, to } = rangeFromQuery(req);
    const oid = new mongoose.Types.ObjectId(String(unitId));
    const rx = new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
    const points = await Upr.aggregate([
      { $match: { unit: oid, cycleDate: { $gte: from, $lte: to }, status: { $in: ['verified', 'sent'] } } },
      { $unwind: '$lines' },
      { $match: { 'lines.itemName': rx } },
      { $group: {
          _id: '$cycleDate',
          qty: { $sum: '$lines.requiredQty' },
          uom: { $last: '$lines.uom' },
          departments: { $addToSet: '$lines.departmentName' },
      } },
      { $project: { _id: 0, cycleDate: '$_id', qty: 1, uom: 1, departments: 1 } },
      { $sort: { cycleDate: 1 } },
    ]);
    res.json({ name, from, to, points });
  } catch (err) {
    next(err);
  }
});

export default router;
