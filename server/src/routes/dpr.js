import { Router } from 'express';
import multer from 'multer';
import Dpr from '../models/Dpr.js';
import Upr from '../models/Upr.js';
import Department from '../models/Department.js';
import Category from '../models/Category.js';
import MinMaxReport from '../models/MinMaxReport.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { logAudit } from '../services/audit.js';
import { parseSpreadsheet, buildMinMaxLines } from '../services/importer.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
router.use(authRequired);

export function todayCycle() {
  return new Date().toISOString().slice(0, 10);
}

const idOf = (v) => String(v?._id ?? v);

function canAccessDpr(user, dpr) {
  if (user.role === 'admin') return true;
  if (idOf(user.unit) !== idOf(dpr.unit)) return false;
  if (user.role === 'dept_head') return idOf(user.department) === idOf(dpr.department);
  return user.role === 'unit_head';
}

// A cycle stays open to department-level re-editing until the Unit Head verifies
// (signs + PDFs) the UPR. Returns the blocking status ('verified'/'sent') or null.
async function cycleLockedBy(unit, cycleDate) {
  const upr = await Upr.findOne({ unit, cycleDate, status: { $in: ['verified', 'sent'] } }).select('status');
  return upr ? upr.status : null;
}

// Current cycle's DPR for the logged-in dept head (null if not created yet).
// `lockedBy` tells the client whether a submitted DPR can still be reopened.
router.get('/current', requireRole('dept_head'), async (req, res, next) => {
  try {
    const cycleDate = todayCycle();
    const dpr = await Dpr.findOne({
      unit: req.user.unit,
      department: req.user.department,
      cycleDate,
    }).populate('lines.category', 'name sortOrder');
    res.json({ dpr, cycleDate, lockedBy: dpr ? await cycleLockedBy(req.user.unit, cycleDate) : null });
  } catch (err) {
    next(err);
  }
});

// Create today's DPR — always blank. Kitchen/Bar fill it by importing the POS
// min-max file (see /:id/import); HouseKeeping adds items manually.
router.post('/', requireRole('dept_head'), async (req, res, next) => {
  try {
    const cycleDate = todayCycle();
    const existing = await Dpr.findOne({ unit: req.user.unit, department: req.user.department, cycleDate });
    if (existing) return res.status(409).json({ error: 'DPR already exists for today', id: existing._id });

    const dept = req.user.department ? await Department.findById(req.user.department) : null;
    if (!dept) return res.status(400).json({ error: 'No department assigned' });

    const dpr = await Dpr.create({
      unit: req.user.unit,
      department: dept._id,
      createdBy: req.user._id,
      cycleDate,
      lines: [],
    });
    await logAudit({ entityType: 'dpr', entityId: dpr._id, action: 'create', changedBy: req.user._id, newValue: { cycleDate } });
    const populated = await Dpr.findById(dpr._id).populate('lines.category', 'name sortOrder');
    res.status(201).json(populated);
  } catch (err) {
    next(err);
  }
});

// Import the POS min-max file (Excel/CSV) into a draft DPR. Replaces POS-fed
// lines, keeps manually-added ones, and archives the feed as a MinMaxReport.
// Not available for departments without a POS feed (HouseKeeping).
router.post('/:id/import', requireRole('dept_head'), upload.single('file'), async (req, res, next) => {
  try {
    const dpr = await Dpr.findById(req.params.id);
    if (!dpr) return res.status(404).json({ error: 'DPR not found' });
    if (!canAccessDpr(req.user, dpr)) return res.status(403).json({ error: 'Forbidden' });
    if (dpr.status !== 'draft') return res.status(409).json({ error: 'DPR is submitted and locked' });
    const dept = await Department.findById(dpr.department);
    if (!dept.hasMinMax)
      return res.status(400).json({ error: `${dept.name} does not receive a POS min-max feed` });
    if (!req.file) return res.status(400).json({ error: 'File required (.xlsx, .xls or .csv)' });

    let records;
    try {
      records = parseSpreadsheet(req.file.buffer);
    } catch (e) {
      return res.status(400).json({ error: 'File parse failed: ' + e.message });
    }
    if (!records.length) return res.status(400).json({ error: 'File has no data rows' });

    const { lines, errors, created } = await buildMinMaxLines(dept, records);
    if (!lines.length) return res.status(400).json({ error: 'No valid rows found', details: errors });

    const report = await MinMaxReport.create({
      unit: dpr.unit,
      department: dept._id,
      reportDate: new Date(),
      source: req.file.originalname,
      uploadedBy: req.user._id,
      lines,
    });
    const populatedReport = await MinMaxReport.findById(report._id)
      .populate('lines.item', 'name uom')
      .populate('lines.category', 'name sortOrder');

    const posLines = populatedReport.lines
      .filter((l) => l.item)
      .sort((a, b) => (a.category?.sortOrder ?? 0) - (b.category?.sortOrder ?? 0) || a.item.name.localeCompare(b.item.name))
      .map((l) => ({
        category: l.category?._id,
        item: l.item._id,
        itemNameOverride: l.item.name,
        uom: l.item.uom,
        closingStock: l.closingStock,
        bufferDays: l.bufferDays,
        minMaxSuggestedQty: l.systemRequiredQty,
        requiredQty: l.systemRequiredQty,
        isManuallyAdded: false,
      }));
    const manualLines = dpr.lines.filter((l) => l.isManuallyAdded);
    dpr.lines = [...posLines, ...manualLines];
    dpr.minMaxReport = report._id;
    await dpr.save();
    await logAudit({ entityType: 'dpr', entityId: dpr._id, action: 'pos-import', changedBy: req.user._id, newValue: { file: req.file.originalname, rows: posLines.length, itemsCreated: created } });

    const populated = await Dpr.findById(dpr._id)
      .populate('lines.category', 'name sortOrder')
      .populate('department', 'name hasMinMax')
      .populate('unit', 'name');
    res.json({ dpr: populated, imported: posLines.length, itemsCreated: created, skipped: errors });
  } catch (err) {
    next(err);
  }
});

// Save draft lines (full replacement) — dept head, draft only
router.put('/:id', requireRole('dept_head'), async (req, res, next) => {
  try {
    const dpr = await Dpr.findById(req.params.id);
    if (!dpr) return res.status(404).json({ error: 'DPR not found' });
    if (!canAccessDpr(req.user, dpr)) return res.status(403).json({ error: 'Forbidden' });
    if (dpr.status !== 'draft') return res.status(409).json({ error: 'DPR is submitted and locked' });

    const { lines } = req.body;
    if (!Array.isArray(lines)) return res.status(400).json({ error: 'lines array required' });

    // Lines picked from the raw-material catalog arrive with a categoryName
    // (the POS category text) instead of a category id — find-or-create that
    // category in this department so UPR grouping and the PDF keep working.
    const cats = await Category.find({ department: dpr.department });
    const catByName = new Map(cats.map((c) => [c.name.trim().toLowerCase(), c]));
    let maxSort = cats.reduce((m, c) => Math.max(m, c.sortOrder ?? 0), 0);
    async function resolveCategory(l) {
      if (l.category) return l.category;
      const name = String(l.categoryName || '').trim();
      if (!name || name.toLowerCase() === 'other') return null;
      let cat = catByName.get(name.toLowerCase());
      if (!cat) {
        cat = await Category.create({ department: dpr.department, name, sortOrder: ++maxSort });
        catByName.set(name.toLowerCase(), cat);
      }
      return cat._id;
    }
    const mapped = [];
    for (const l of lines) {
      mapped.push({
        category: await resolveCategory(l),
        item: l.item || null,
        itemNameOverride: l.itemNameOverride || '',
        uom: l.uom || '',
        closingStock: l.closingStock ?? null,
        bufferDays: l.bufferDays ?? null,
        minMaxSuggestedQty: l.minMaxSuggestedQty ?? null,
        requiredQty: Number(l.requiredQty || 0),
        remark: l.remark || '',
        isManuallyAdded: !!l.isManuallyAdded,
      });
    }
    dpr.lines = mapped;
    await dpr.save();
    const populated = await Dpr.findById(dpr._id).populate('lines.category', 'name sortOrder');
    res.json(populated);
  } catch (err) {
    next(err);
  }
});

// Submit: e-sign (name + timestamp), lock from dept-head edits
router.post('/:id/submit', requireRole('dept_head'), async (req, res, next) => {
  try {
    const dpr = await Dpr.findById(req.params.id);
    if (!dpr) return res.status(404).json({ error: 'DPR not found' });
    if (!canAccessDpr(req.user, dpr)) return res.status(403).json({ error: 'Forbidden' });
    if (dpr.status !== 'draft') return res.status(409).json({ error: 'Already submitted' });
    const kept = dpr.lines.filter((l) => Number(l.requiredQty) > 0 || (l.remark || '').trim());
    if (!kept.length) return res.status(400).json({ error: 'Nothing to submit — set a Required Qty on at least one item' });
    dpr.lines = kept;
    dpr.status = 'submitted';
    dpr.hodSignName = req.user.name;
    dpr.hodSignDate = new Date();
    await dpr.save();
    await logAudit({ entityType: 'dpr', entityId: dpr._id, action: 'submit', changedBy: req.user._id, newValue: { lines: kept.length, signedBy: req.user.name } });
    res.json({ ok: true, status: dpr.status });
  } catch (err) {
    next(err);
  }
});

// Reopen a submitted DPR for re-editing (Open Q3: allowed). Two callers:
// the Unit Head sending a DPR back, and the Department Head pulling their own
// back before the Unit Head verifies. Either way the DPR's lines leave the draft
// UPR (any unit-head edits to them are dropped) and return on the next
// consolidate/refresh. Blocked once the UPR is verified or sent.
router.post('/:id/reopen', requireRole('unit_head', 'dept_head'), async (req, res, next) => {
  try {
    const dpr = await Dpr.findById(req.params.id);
    if (!dpr) return res.status(404).json({ error: 'DPR not found' });
    if (!canAccessDpr(req.user, dpr)) return res.status(403).json({ error: 'Forbidden' });
    if (dpr.status !== 'submitted') return res.status(409).json({ error: 'DPR is not submitted' });
    const lockedBy = await cycleLockedBy(dpr.unit, dpr.cycleDate);
    if (lockedBy)
      return res.status(409).json({
        error:
          req.user.role === 'dept_head'
            ? `The Unit Head has already ${lockedBy} this cycle's UPR — corrections go in the next cycle`
            : 'UPR already verified for this cycle — start a new cycle instead',
      });
    await Upr.updateOne(
      { unit: dpr.unit, cycleDate: dpr.cycleDate, status: 'draft' },
      { $pull: { dprs: dpr._id, lines: { dpr: dpr._id } } }
    );
    const signedBy = dpr.hodSignName;
    dpr.status = 'draft';
    dpr.hodSignName = '';
    dpr.hodSignDate = null;
    await dpr.save();
    await logAudit({
      entityType: 'dpr',
      entityId: dpr._id,
      action: req.user.role === 'dept_head' ? 'dept-head-reopen' : 'reopen',
      changedBy: req.user._id,
      oldValue: { status: 'submitted', signedBy },
      newValue: { status: 'draft' },
    });
    res.json({ ok: true, status: dpr.status });
  } catch (err) {
    next(err);
  }
});

// History for the logged-in dept head (or unit head sees unit's DPRs)
router.get('/history', async (req, res, next) => {
  try {
    const q = {};
    if (req.user.role === 'dept_head') {
      q.unit = req.user.unit;
      q.department = req.user.department;
    } else if (req.user.role === 'unit_head') {
      q.unit = req.user.unit;
    } else if (req.user.role === 'admin') {
      if (req.query.unitId) q.unit = req.query.unitId;
    } else {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (req.query.from || req.query.to) {
      q.cycleDate = {};
      if (req.query.from) q.cycleDate.$gte = req.query.from;
      if (req.query.to) q.cycleDate.$lte = req.query.to;
    }
    const dprs = await Dpr.find(q)
      .select('-lines')
      .populate('department', 'name')
      .populate('unit', 'name')
      .sort({ cycleDate: -1 })
      .limit(100);
    res.json(dprs);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const dpr = await Dpr.findById(req.params.id)
      .populate('lines.category', 'name sortOrder')
      .populate('department', 'name hasMinMax')
      .populate('unit', 'name')
      .populate('createdBy', 'name');
    if (!dpr) return res.status(404).json({ error: 'DPR not found' });
    if (!canAccessDpr(req.user, dpr)) return res.status(403).json({ error: 'Forbidden' });
    // lockedBy: 'verified'/'sent' once the Unit Head has closed the cycle — the
    // DPR screen uses it to decide whether re-editing is still on the table.
    res.json({ ...dpr.toObject(), lockedBy: await cycleLockedBy(dpr.unit, dpr.cycleDate) });
  } catch (err) {
    next(err);
  }
});

export default router;
