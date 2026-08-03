import { Router } from 'express';
import fs from 'fs';
import Dpr from '../models/Dpr.js';
import Upr from '../models/Upr.js';
import Department from '../models/Department.js';
import Category from '../models/Category.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { logAudit } from '../services/audit.js';
import { generateUprPdf } from '../services/pdf.js';
import { sendUprEmail, getPurchaseHead, getPurchaseHeadEmail } from '../services/mailer.js';
import { todayCycle } from './dpr.js';

const router = Router();
router.use(authRequired);

const idOf = (v) => String(v?._id ?? v);

function canAccessUpr(user, upr) {
  if (user.role === 'admin' || user.role === 'purchase_head') return true;
  return idOf(user.unit) === idOf(upr.unit);
}

// Unit Head dashboard: each department's DPR status for today + UPR status
router.get('/dashboard', requireRole('unit_head'), async (req, res, next) => {
  try {
    const cycleDate = todayCycle();
    const departments = await Department.find({ unit: req.user.unit, active: true }).sort({ name: 1 });
    const dprs = await Dpr.find({ unit: req.user.unit, cycleDate }).select('-lines');
    const upr = await Upr.findOne({ unit: req.user.unit, cycleDate }).select('-lines');
    const dprByDept = new Map(dprs.map((d) => [String(d.department), d]));
    res.json({
      cycleDate,
      upr,
      departments: departments.map((d) => {
        const dpr = dprByDept.get(String(d._id));
        return {
          id: d._id,
          name: d.name,
          hasMinMax: d.hasMinMax,
          dprId: dpr?._id || null,
          dprStatus: dpr ? dpr.status : 'pending',
          hodSignName: dpr?.hodSignName || '',
          hodSignDate: dpr?.hodSignDate || null,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

// Who will receive sent UPRs — the active Purchase Head. Recipient is fixed
// group-wide; the send route always resolves it fresh and ignores any override.
router.get('/send-target', requireRole('unit_head', 'admin'), async (req, res, next) => {
  try {
    const ph = await getPurchaseHead();
    res.json({
      name: ph?.name || null,
      email: ph?.email || process.env.PURCHASE_HEAD_EMAIL || null,
    });
  } catch (err) {
    next(err);
  }
});

// Build or refresh today's draft UPR from submitted DPRs.
// Existing lines (incl. unit-head edits) are kept; only DPRs not yet pulled in are added.
router.post('/consolidate', requireRole('unit_head'), async (req, res, next) => {
  try {
    const cycleDate = todayCycle();
    let upr = await Upr.findOne({ unit: req.user.unit, cycleDate });
    if (upr && upr.status !== 'draft')
      return res.status(409).json({ error: `UPR already ${upr.status} for this cycle` });

    const submitted = await Dpr.find({ unit: req.user.unit, cycleDate, status: 'submitted' })
      .populate('department', 'name')
      .populate('lines.category', 'name sortOrder');
    if (!submitted.length && !upr)
      return res.status(400).json({ error: 'No submitted DPRs for today yet' });

    if (!upr) {
      upr = new Upr({ unit: req.user.unit, createdBy: req.user._id, cycleDate, dprs: [], lines: [] });
    }

    const already = new Set(upr.dprs.map(String));
    for (const dpr of submitted) {
      if (already.has(String(dpr._id))) continue;
      upr.dprs.push(dpr._id);
      for (const l of dpr.lines) {
        upr.lines.push({
          dpr: dpr._id,
          dprLineId: l._id,
          department: dpr.department._id,
          departmentName: dpr.department.name,
          category: l.category?._id || null,
          categoryName: l.category?.name || 'Other',
          itemName: l.itemNameOverride,
          uom: l.uom,
          closingStock: l.closingStock,
          bufferDays: l.bufferDays,
          requiredQty: l.requiredQty,
          remark: l.remark,
        });
      }
    }
    await upr.save();
    res.json(await Upr.findById(upr._id));
  } catch (err) {
    next(err);
  }
});

router.get('/current', requireRole('unit_head'), async (req, res, next) => {
  try {
    const upr = await Upr.findOne({ unit: req.user.unit, cycleDate: todayCycle() });
    res.json({ upr, cycleDate: todayCycle() });
  } catch (err) {
    next(err);
  }
});

// History / list. Purchase head & admin see all units; unit head only their own.
router.get('/history', async (req, res, next) => {
  try {
    const q = {};
    if (req.user.role === 'unit_head' || req.user.role === 'dept_head') q.unit = req.user.unit;
    else if (req.query.unitId) q.unit = req.query.unitId;
    if (req.query.status) q.status = req.query.status;
    if (req.query.from || req.query.to) {
      q.cycleDate = {};
      if (req.query.from) q.cycleDate.$gte = req.query.from;
      if (req.query.to) q.cycleDate.$lte = req.query.to;
    }
    const uprs = await Upr.find(q)
      .select('-lines')
      .populate('unit', 'name city')
      .populate('createdBy', 'name')
      .sort({ cycleDate: -1 })
      .limit(100);
    res.json(uprs);
  } catch (err) {
    next(err);
  }
});

// Edit a line's qty/remark — unit head, draft only, audited (old vs new value)
router.put('/:id/lines/:lineId', requireRole('unit_head'), async (req, res, next) => {
  try {
    const upr = await Upr.findById(req.params.id);
    if (!upr) return res.status(404).json({ error: 'UPR not found' });
    if (!canAccessUpr(req.user, upr)) return res.status(403).json({ error: 'Forbidden' });
    if (upr.status !== 'draft') return res.status(409).json({ error: 'UPR is locked' });
    const line = upr.lines.id(req.params.lineId);
    if (!line) return res.status(404).json({ error: 'Line not found' });

    const old = { requiredQty: line.requiredQty, remark: line.remark };
    if (req.body.requiredQty !== undefined) line.requiredQty = Number(req.body.requiredQty);
    if (req.body.remark !== undefined) line.remark = req.body.remark;
    await upr.save();
    if (old.requiredQty !== line.requiredQty || old.remark !== line.remark) {
      await logAudit({
        entityType: 'upr_line',
        entityId: line._id,
        action: 'unit-head-edit',
        changedBy: req.user._id,
        oldValue: { item: line.itemName, ...old },
        newValue: { item: line.itemName, requiredQty: line.requiredQty, remark: line.remark },
      });
    }
    res.json(line);
  } catch (err) {
    next(err);
  }
});

// Add a manual line to the draft UPR
router.post('/:id/lines', requireRole('unit_head'), async (req, res, next) => {
  try {
    const upr = await Upr.findById(req.params.id);
    if (!upr) return res.status(404).json({ error: 'UPR not found' });
    if (!canAccessUpr(req.user, upr)) return res.status(403).json({ error: 'Forbidden' });
    if (upr.status !== 'draft') return res.status(409).json({ error: 'UPR is locked' });
    const { departmentId, categoryId, itemName, uom, requiredQty, remark } = req.body;
    if (!departmentId || !itemName) return res.status(400).json({ error: 'departmentId and itemName required' });
    const dept = await Department.findById(departmentId);
    if (!dept || String(dept.unit) !== String(upr.unit)) return res.status(400).json({ error: 'Invalid department' });
    const cat = categoryId ? await Category.findById(categoryId) : null;
    upr.lines.push({
      department: dept._id,
      departmentName: dept.name,
      category: cat?._id || null,
      categoryName: cat?.name || 'Other',
      itemName,
      uom: uom || '',
      requiredQty: Number(requiredQty || 0),
      remark: remark || '',
    });
    await upr.save();
    const line = upr.lines[upr.lines.length - 1];
    await logAudit({ entityType: 'upr_line', entityId: line._id, action: 'unit-head-add', changedBy: req.user._id, newValue: { item: itemName, requiredQty: line.requiredQty } });
    res.status(201).json(line);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/lines/:lineId', requireRole('unit_head'), async (req, res, next) => {
  try {
    const upr = await Upr.findById(req.params.id);
    if (!upr) return res.status(404).json({ error: 'UPR not found' });
    if (!canAccessUpr(req.user, upr)) return res.status(403).json({ error: 'Forbidden' });
    if (upr.status !== 'draft') return res.status(409).json({ error: 'UPR is locked' });
    const line = upr.lines.id(req.params.lineId);
    if (!line) return res.status(404).json({ error: 'Line not found' });
    const old = { item: line.itemName, requiredQty: line.requiredQty };
    line.deleteOne();
    await upr.save();
    await logAudit({ entityType: 'upr_line', entityId: req.params.lineId, action: 'unit-head-remove', changedBy: req.user._id, oldValue: old });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Verify: lock the UPR, e-sign, generate the PDF
router.post('/:id/verify', requireRole('unit_head'), async (req, res, next) => {
  try {
    const upr = await Upr.findById(req.params.id).populate('unit', 'name city');
    if (!upr) return res.status(404).json({ error: 'UPR not found' });
    if (!canAccessUpr(req.user, upr)) return res.status(403).json({ error: 'Forbidden' });
    if (upr.status !== 'draft') return res.status(409).json({ error: `UPR already ${upr.status}` });
    if (!upr.lines.length) return res.status(400).json({ error: 'UPR has no lines' });
    upr.status = 'verified';
    upr.verifiedAt = new Date();
    upr.verifiedSignName = req.user.name;
    const { filePath } = await generateUprPdf(upr);
    upr.pdfPath = filePath;
    await upr.save();
    await logAudit({ entityType: 'upr', entityId: upr._id, action: 'verify', changedBy: req.user._id, newValue: { lines: upr.lines.length, signedBy: req.user.name } });
    res.json({ ok: true, status: upr.status });
  } catch (err) {
    next(err);
  }
});

// Send to Purchase Head by email with PDF attached
router.post('/:id/send', requireRole('unit_head'), async (req, res, next) => {
  try {
    // smtpPass is select:false — pull it explicitly so the unit's own mailbox can send.
    const upr = await Upr.findById(req.params.id).populate({
      path: 'unit',
      select: 'name city smtpUser +smtpPass',
    });
    if (!upr) return res.status(404).json({ error: 'UPR not found' });
    if (!canAccessUpr(req.user, upr)) return res.status(403).json({ error: 'Forbidden' });
    if (upr.status !== 'verified') return res.status(409).json({ error: 'UPR must be verified first' });

    // The recipient is always the active Purchase Head — per-send overrides
    // are not allowed so every UPR lands in the same mailbox.
    const to = await getPurchaseHeadEmail();
    if (!to) return res.status(400).json({ error: 'No Purchase Head email configured' });

    const subject = `UPR — ${upr.unit.name} — ${upr.cycleDate}`;
    const { devMode } = await sendUprEmail({
      to,
      subject,
      text:
        `Please find attached the Unit Purchase Requisition for ${upr.unit.name} dated ${upr.cycleDate}.\n\n` +
        `Verified by: ${upr.verifiedSignName}\nItems: ${upr.lines.length}\n\n— CPH Requisition System`,
      attachmentPath: upr.pdfPath,
      attachmentName: `UPR-${upr.unit.name}-${upr.cycleDate}.pdf`,
      unit: upr.unit,
    });

    upr.status = 'sent';
    upr.sentAt = new Date();
    upr.sentToEmail = to;
    await upr.save();
    await logAudit({ entityType: 'upr', entityId: upr._id, action: 'send', changedBy: req.user._id, newValue: { to, subject, devMode } });
    res.json({ ok: true, status: upr.status, sentTo: to, devMode });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/pdf', async (req, res, next) => {
  try {
    const upr = await Upr.findById(req.params.id).populate('unit', 'name city');
    if (!upr) return res.status(404).json({ error: 'UPR not found' });
    if (!canAccessUpr(req.user, upr)) return res.status(403).json({ error: 'Forbidden' });
    let pdfPath = upr.pdfPath;
    if (!pdfPath || !fs.existsSync(pdfPath)) {
      if (upr.status === 'draft') return res.status(404).json({ error: 'PDF is generated on verify' });
      const gen = await generateUprPdf(upr);
      pdfPath = gen.filePath;
      upr.pdfPath = pdfPath;
      await upr.save();
    }
    res.download(pdfPath, `UPR-${upr.unit.name}-${upr.cycleDate}.pdf`);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const upr = await Upr.findById(req.params.id)
      .populate('unit', 'name city')
      .populate('createdBy', 'name');
    if (!upr) return res.status(404).json({ error: 'UPR not found' });
    if (!canAccessUpr(req.user, upr)) return res.status(403).json({ error: 'Forbidden' });
    res.json(upr);
  } catch (err) {
    next(err);
  }
});

export default router;
