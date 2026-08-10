import { Router } from 'express';
import mongoose from 'mongoose';
import Unit from '../models/Unit.js';
import Department from '../models/Department.js';
import Dpr from '../models/Dpr.js';
import Upr from '../models/Upr.js';
import AuditLog from '../models/AuditLog.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { todayCycle } from './dpr.js';

const router = Router();
router.use(authRequired);

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const EDIT_ACTIONS = ['unit-head-edit', 'unit-head-add', 'unit-head-remove'];

// from/to as YYYY-MM-DD; defaults to the last 30 days ending today, capped at maxDays.
function rangeFromQuery(req, maxDays = 366) {
  let to = DATE_RX.test(req.query.to || '') ? req.query.to : todayCycle();
  let from = DATE_RX.test(req.query.from || '') ? req.query.from : '';
  if (!from) {
    const d = new Date(to + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 29);
    from = d.toISOString().slice(0, 10);
  }
  if (from > to) [from, to] = [to, from];
  let days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  if (days > maxDays) {
    const d = new Date(to + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - (maxDays - 1));
    from = d.toISOString().slice(0, 10);
    days = maxDays;
  }
  return { from, to, days };
}

function datesBetween(from, to) {
  const out = [];
  const d = new Date(from + 'T00:00:00Z');
  const end = Date.parse(to + 'T00:00:00Z');
  while (d.getTime() <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// Admin & purchase head may pass ?unitId= (absent = whole group); unit heads
// are always scoped to their own unit.
function scopeUnitId(req) {
  if (req.user.role === 'unit_head') return String(req.user.unit || '');
  const q = String(req.query.unitId || '');
  return mongoose.isValidObjectId(q) ? q : '';
}

function unitFilter(unitId) {
  return unitId ? { unit: new mongoose.Types.ObjectId(unitId) } : {};
}

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 100) : 0);

// Unit-head line changes in a window, resolved to units via the acting user.
function editsPipeline(from, to, unitId) {
  const pipeline = [
    { $match: {
        action: { $in: EDIT_ACTIONS },
        timestamp: { $gte: new Date(from + 'T00:00:00.000Z'), $lte: new Date(to + 'T23:59:59.999Z') },
    } },
    { $lookup: { from: 'users', localField: 'changedBy', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
  ];
  if (unitId) pipeline.push({ $match: { 'user.unit': new mongoose.Types.ObjectId(unitId) } });
  return pipeline;
}

// ---------------------------------------------------------------------------
// Analytical dashboard: KPIs, daily trend, top departments, top items per
// department, category mix and (group view) unit comparison. "Ordered" figures
// read from verified/sent UPR lines with qty > 0 — the signed source of truth.
// ---------------------------------------------------------------------------
router.get('/dashboard', requireRole('admin', 'unit_head', 'purchase_head'), async (req, res, next) => {
  try {
    const unitId = scopeUnitId(req);
    if (req.user.role === 'unit_head' && !unitId) return res.status(400).json({ error: 'No unit assigned' });
    const { from, to, days } = rangeFromQuery(req);
    const scope = unitFilter(unitId);
    const inRange = { ...scope, cycleDate: { $gte: from, $lte: to } };
    const uprMatch = { ...inRange, status: { $in: ['verified', 'sent'] } };
    const orderedLines = [
      { $match: uprMatch },
      { $unwind: '$lines' },
      { $match: { 'lines.requiredQty': { $gt: 0 } } },
    ];

    const [
      units, deptDocs, activeDates, dprByStatus, deptDprAgg, offList, uprByStatus,
      trendAgg, deptLinesAgg, deptItemsAgg, topItems, categoryAgg, editAgg,
    ] = await Promise.all([
      Unit.find({ active: true }).sort({ name: 1 }).select('name city'),
      Department.find({ active: true, ...(unitId ? { unit: unitId } : {}) }).select('unit name'),
      Dpr.distinct('cycleDate', inRange),
      Dpr.aggregate([{ $match: inRange }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      Dpr.aggregate([
        { $match: { ...inRange, status: 'submitted' } },
        { $group: { _id: { unit: '$unit', department: '$department' }, days: { $addToSet: '$cycleDate' } } },
      ]),
      Dpr.aggregate([
        { $match: { ...inRange, status: 'submitted' } },
        { $unwind: '$lines' },
        { $match: { 'lines.isManuallyAdded': true, 'lines.requiredQty': { $gt: 0 } } },
        { $count: 'n' },
      ]),
      Upr.aggregate([{ $match: inRange }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      Upr.aggregate([
        ...orderedLines,
        { $group: { _id: '$cycleDate', lines: { $sum: 1 } } },
      ]),
      Upr.aggregate([
        ...orderedLines,
        { $group: {
            _id: { unit: '$unit', department: '$lines.department' },
            name: { $last: '$lines.departmentName' },
            lines: { $sum: 1 },
            items: { $addToSet: { $toLower: '$lines.itemName' } },
        } },
        { $project: { name: 1, lines: 1, items: { $size: '$items' } } },
        { $sort: { lines: -1 } },
      ]),
      Upr.aggregate([
        ...orderedLines,
        { $group: {
            _id: { unit: '$unit', department: '$lines.department', name: { $toLower: '$lines.itemName' }, uom: '$lines.uom' },
            name: { $last: '$lines.itemName' },
            uom: { $last: '$lines.uom' },
            deptName: { $last: '$lines.departmentName' },
            qty: { $sum: '$lines.requiredQty' },
            cycles: { $addToSet: '$cycleDate' },
        } },
        { $project: { name: 1, uom: 1, deptName: 1, qty: 1, times: { $size: '$cycles' } } },
      ]),
      Upr.aggregate([
        ...orderedLines,
        { $group: {
            _id: { name: { $toLower: '$lines.itemName' }, uom: '$lines.uom' },
            name: { $last: '$lines.itemName' },
            uom: { $last: '$lines.uom' },
            category: { $last: '$lines.categoryName' },
            qty: { $sum: '$lines.requiredQty' },
            cycles: { $addToSet: '$cycleDate' },
        } },
        { $project: { _id: 0, name: 1, uom: 1, category: 1, qty: 1, times: { $size: '$cycles' } } },
        { $sort: { times: -1, qty: -1 } },
        { $limit: 10 },
      ]),
      Upr.aggregate([
        ...orderedLines,
        { $group: {
            _id: { $cond: [{ $in: ['$lines.categoryName', ['', null]] }, 'Other', '$lines.categoryName'] },
            lines: { $sum: 1 },
            items: { $addToSet: { $toLower: '$lines.itemName' } },
        } },
        { $project: { _id: 0, name: '$_id', lines: 1, items: { $size: '$items' } } },
        { $sort: { lines: -1 } },
      ]),
      AuditLog.aggregate([...editsPipeline(from, to, unitId), { $group: { _id: '$action', n: { $sum: 1 } } }]),
    ]);

    const unitName = new Map(units.map((u) => [String(u._id), u.name]));
    const groupView = !unitId;
    const dprBy = new Map(dprByStatus.map((s) => [s._id, s.n]));
    const uprBy = new Map(uprByStatus.map((s) => [s._id, s.n]));
    const editBy = new Map(editAgg.map((e) => [e._id, e.n]));

    const dprsSubmitted = dprBy.get('submitted') || 0;
    const expectedDprs = deptDocs.length * activeDates.length;
    const totalOrdered = trendAgg.reduce((s, t) => s + t.lines, 0);

    // Zero-filled daily trend across the whole range.
    const byDate = new Map(trendAgg.map((t) => [t._id, t.lines]));
    const trend = datesBetween(from, to).map((date) => ({ date, lines: byDate.get(date) || 0 }));

    // DPR discipline per department, keyed for the top-departments merge.
    const submittedDaysBy = new Map(
      deptDprAgg.map((d) => [`${d._id.unit}:${d._id.department}`, d.days.length])
    );

    const topDepartments = deptLinesAgg.slice(0, 12).map((d) => ({
      id: String(d._id.department),
      name: d.name || 'Unknown',
      unitName: groupView ? unitName.get(String(d._id.unit)) || '' : '',
      lines: d.lines,
      items: d.items,
      submittedDays: submittedDaysBy.get(`${d._id.unit}:${d._id.department}`) || 0,
      sharePct: pct(d.lines, totalOrdered),
    }));

    // Top items inside each department (ranked by order frequency, then qty —
    // qty alone is not comparable across UOMs).
    const deptBuckets = new Map();
    for (const row of deptItemsAgg) {
      const key = `${row._id.unit}:${row._id.department}`;
      if (!deptBuckets.has(key)) {
        deptBuckets.set(key, {
          id: String(row._id.department),
          name: row.deptName || 'Unknown',
          unitName: groupView ? unitName.get(String(row._id.unit)) || '' : '',
          items: [],
        });
      }
      deptBuckets.get(key).items.push({ name: row.name, uom: row.uom, qty: row.qty, times: row.times });
    }
    const deptOrder = new Map(deptLinesAgg.map((d, i) => [`${d._id.unit}:${d._id.department}`, i]));
    const itemsByDepartment = [...deptBuckets.entries()]
      .sort((a, b) => (deptOrder.get(a[0]) ?? 999) - (deptOrder.get(b[0]) ?? 999))
      .slice(0, 9)
      .map(([, bucket]) => ({
        ...bucket,
        items: bucket.items.sort((a, b) => b.times - a.times || b.qty - a.qty).slice(0, 6),
      }));

    const distinctItems = new Set(deptItemsAgg.map((r) => `${r._id.name}|${r._id.uom}`)).size;

    // Unit comparison for the group view.
    let unitsCompare = [];
    if (groupView) {
      const linesByUnit = new Map();
      for (const d of deptLinesAgg) {
        const k = String(d._id.unit);
        linesByUnit.set(k, (linesByUnit.get(k) || 0) + d.lines);
      }
      const [dprByUnit, uprSentByUnit] = await Promise.all([
        Dpr.aggregate([
          { $match: { ...inRange, status: 'submitted' } },
          { $group: { _id: '$unit', n: { $sum: 1 } } },
        ]),
        Upr.aggregate([
          { $match: { ...inRange, status: 'sent' } },
          { $group: { _id: '$unit', n: { $sum: 1 } } },
        ]),
      ]);
      const dprN = new Map(dprByUnit.map((u) => [String(u._id), u.n]));
      const sentN = new Map(uprSentByUnit.map((u) => [String(u._id), u.n]));
      unitsCompare = units.map((u) => ({
        id: String(u._id),
        name: u.name,
        city: u.city,
        departments: deptDocs.filter((d) => String(d.unit) === String(u._id)).length,
        lines: linesByUnit.get(String(u._id)) || 0,
        dprsSubmitted: dprN.get(String(u._id)) || 0,
        uprsSent: sentN.get(String(u._id)) || 0,
      }));
    }

    res.json({
      from,
      to,
      days,
      scope: { unitId: unitId || null, unitName: unitId ? unitName.get(unitId) || '' : '' },
      unitsList: req.user.role === 'unit_head' ? [] : units.map((u) => ({ id: String(u._id), name: u.name })),
      summary: {
        activeDays: activeDates.length,
        dprsSubmitted,
        dprCompliancePct: pct(dprsSubmitted, expectedDprs),
        uprsSent: uprBy.get('sent') || 0,
        uprsVerified: uprBy.get('verified') || 0,
        orderedLines: totalOrdered,
        distinctItems,
        offListLines: offList[0]?.n || 0,
        unitHeadChanges: {
          edited: editBy.get('unit-head-edit') || 0,
          added: editBy.get('unit-head-add') || 0,
          removed: editBy.get('unit-head-remove') || 0,
        },
      },
      trend,
      topDepartments,
      itemsByDepartment,
      topItems,
      categories: categoryAgg.map((c) => ({ ...c, sharePct: pct(c.lines, totalOrdered) })),
      units: unitsCompare,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Report: DPR submission compliance — department × day status matrix.
// ---------------------------------------------------------------------------
router.get('/compliance', requireRole('admin', 'unit_head'), async (req, res, next) => {
  try {
    const unitId = scopeUnitId(req);
    if (req.user.role === 'unit_head' && !unitId) return res.status(400).json({ error: 'No unit assigned' });
    const { from, to, days } = rangeFromQuery(req, 185);
    const dates = datesBetween(from, to);
    const scope = unitFilter(unitId);

    const [units, depts, dprs] = await Promise.all([
      Unit.find({ active: true }).sort({ name: 1 }).select('name'),
      Department.find({ active: true, ...(unitId ? { unit: unitId } : {}) }).sort({ name: 1 }).select('unit name'),
      Dpr.find({ ...scope, cycleDate: { $gte: from, $lte: to } }).select('unit department cycleDate status'),
    ]);

    const statusBy = new Map(dprs.map((d) => [`${d.unit}:${d.department}:${d.cycleDate}`, d.status]));
    const unitGroups = (unitId ? units.filter((u) => String(u._id) === unitId) : units)
      .map((u) => {
        const rows = depts
          .filter((d) => String(d.unit) === String(u._id))
          .map((d) => {
            const statuses = dates.map((date) => statusBy.get(`${u._id}:${d._id}:${date}`) || null);
            const submitted = statuses.filter((s) => s === 'submitted').length;
            const drafts = statuses.filter((s) => s === 'draft').length;
            return { name: d.name, statuses, submitted, drafts, missing: days - submitted - drafts, ratePct: pct(submitted, days) };
          });
        return { unit: u.name, departments: rows };
      })
      .filter((g) => g.departments.length > 0);

    res.json({ from, to, days, dates, groups: unitGroups });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Report: item order register — every item ordered in the range, with
// department, frequency, totals and last-ordered date. From verified/sent UPRs.
// ---------------------------------------------------------------------------
router.get('/register', requireRole('admin', 'unit_head'), async (req, res, next) => {
  try {
    const unitId = scopeUnitId(req);
    if (req.user.role === 'unit_head' && !unitId) return res.status(400).json({ error: 'No unit assigned' });
    const { from, to, days } = rangeFromQuery(req);
    const match = {
      ...unitFilter(unitId),
      cycleDate: { $gte: from, $lte: to },
      status: { $in: ['verified', 'sent'] },
    };
    const lineMatch = { 'lines.requiredQty': { $gt: 0 } };
    if (mongoose.isValidObjectId(String(req.query.department || ''))) {
      lineMatch['lines.department'] = new mongoose.Types.ObjectId(String(req.query.department));
    }

    const [rows, units, depts] = await Promise.all([
      Upr.aggregate([
        { $match: match },
        { $unwind: '$lines' },
        { $match: lineMatch },
        { $group: {
            _id: { unit: '$unit', department: '$lines.department', name: { $toLower: '$lines.itemName' }, uom: '$lines.uom' },
            item: { $last: '$lines.itemName' },
            uom: { $last: '$lines.uom' },
            category: { $last: '$lines.categoryName' },
            department: { $last: '$lines.departmentName' },
            totalQty: { $sum: '$lines.requiredQty' },
            cycles: { $addToSet: '$cycleDate' },
            lastOrdered: { $max: '$cycleDate' },
        } },
        { $project: {
            unit: '$_id.unit', item: 1, uom: 1, category: 1, department: 1,
            totalQty: 1, times: { $size: '$cycles' }, lastOrdered: 1, _id: 0,
        } },
        { $sort: { department: 1, item: 1 } },
        { $limit: 2000 },
      ]),
      Unit.find({ active: true }).select('name'),
      Department.find({ active: true, ...(unitId ? { unit: unitId } : {}) }).sort({ name: 1 }).select('unit name'),
    ]);

    const unitName = new Map(units.map((u) => [String(u._id), u.name]));
    res.json({
      from,
      to,
      days,
      departments: depts.map((d) => ({ id: String(d._id), name: d.name, unit: unitName.get(String(d.unit)) || '' })),
      rows: rows.map((r) => ({
        ...r,
        unit: unitId ? undefined : unitName.get(String(r.unit)) || '',
        avgQty: r.times ? Math.round((r.totalQty / r.times) * 100) / 100 : 0,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Report: UPR dispatch log — every UPR in the range with verification and
// dispatch details.
// ---------------------------------------------------------------------------
router.get('/dispatch', requireRole('admin', 'unit_head'), async (req, res, next) => {
  try {
    const unitId = scopeUnitId(req);
    if (req.user.role === 'unit_head' && !unitId) return res.status(400).json({ error: 'No unit assigned' });
    const { from, to, days } = rangeFromQuery(req);
    const uprs = await Upr.find({ ...unitFilter(unitId), cycleDate: { $gte: from, $lte: to } })
      .populate('unit', 'name')
      .sort({ cycleDate: -1 })
      .select('unit cycleDate status lines verifiedAt verifiedSignName sentAt sentToEmail')
      .limit(1000);
    res.json({
      from,
      to,
      days,
      rows: uprs.map((u) => ({
        id: String(u._id),
        cycleDate: u.cycleDate,
        unit: u.unit?.name || '',
        status: u.status,
        lines: u.lines.length,
        orderedLines: u.lines.filter((l) => l.requiredQty > 0).length,
        verifiedSignName: u.verifiedSignName,
        verifiedAt: u.verifiedAt,
        sentAt: u.sentAt,
        sentToEmail: u.sentToEmail,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Report: unit-head changes — every UPR line the unit head edited, added or
// removed after department submission (from the audit trail).
// ---------------------------------------------------------------------------
router.get('/edits', requireRole('admin', 'unit_head'), async (req, res, next) => {
  try {
    const unitId = scopeUnitId(req);
    if (req.user.role === 'unit_head' && !unitId) return res.status(400).json({ error: 'No unit assigned' });
    const { from, to, days } = rangeFromQuery(req);
    const rows = await AuditLog.aggregate([
      ...editsPipeline(from, to, unitId),
      { $sort: { timestamp: -1 } },
      { $limit: 1000 },
      { $project: {
          _id: 0,
          timestamp: 1,
          action: 1,
          user: '$user.name',
          unit: '$user.unit',
          item: { $ifNull: ['$newValue.item', '$oldValue.item'] },
          oldQty: '$oldValue.requiredQty',
          newQty: '$newValue.requiredQty',
          oldRemark: '$oldValue.remark',
          newRemark: '$newValue.remark',
      } },
    ]);
    const units = await Unit.find({ active: true }).select('name');
    const unitName = new Map(units.map((u) => [String(u._id), u.name]));
    res.json({
      from,
      to,
      days,
      rows: rows.map((r) => ({ ...r, unit: unitName.get(String(r.unit)) || '' })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
