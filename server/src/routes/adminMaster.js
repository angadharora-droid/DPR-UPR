import { Router } from 'express';
import Department from '../models/Department.js';
import Category from '../models/Category.js';
import Item from '../models/Item.js';
import RawMaterial from '../models/RawMaterial.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { logAudit } from '../services/audit.js';

const router = Router();
router.use(authRequired);

// Departments of a unit — readable by any logged-in user of that unit; admin anywhere.
router.get('/departments', async (req, res, next) => {
  try {
    const unitId = req.user.role === 'admin' ? req.query.unitId : req.user.unit;
    if (!unitId) return res.status(400).json({ error: 'unitId required' });
    if (req.user.role !== 'admin' && String(req.user.unit) !== String(unitId))
      return res.status(403).json({ error: 'Forbidden' });
    res.json(await Department.find({ unit: unitId }).sort({ name: 1 }));
  } catch (err) {
    next(err);
  }
});

router.get('/categories', async (req, res, next) => {
  try {
    const { departmentId } = req.query;
    if (!departmentId) return res.status(400).json({ error: 'departmentId required' });
    const dept = await Department.findById(departmentId);
    if (!dept) return res.status(404).json({ error: 'Department not found' });
    if (req.user.role !== 'admin' && String(req.user.unit) !== String(dept.unit))
      return res.status(403).json({ error: 'Forbidden' });
    res.json(await Category.find({ department: departmentId }).sort({ sortOrder: 1, name: 1 }));
  } catch (err) {
    next(err);
  }
});

router.get('/items', async (req, res, next) => {
  try {
    const { categoryId } = req.query;
    if (!categoryId) return res.status(400).json({ error: 'categoryId required' });
    res.json(await Item.find({ category: categoryId, active: true }).sort({ name: 1 }));
  } catch (err) {
    next(err);
  }
});

// Raw-material lookup for DPR entry — scoped to the caller's own unit
// (admin passes unitId). Returns the catalog size plus the top name matches,
// prefix matches ranked before substring matches.
router.get('/raw-materials', async (req, res, next) => {
  try {
    const unitId = req.user.role === 'admin' ? req.query.unitId : req.user.unit;
    if (!unitId) return res.status(400).json({ error: 'unitId required' });
    const total = await RawMaterial.countDocuments({ unit: unitId, active: true });
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ total, results: [] });
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const found = await RawMaterial.find({ unit: unitId, active: true, name: rx })
      .sort({ name: 1 })
      .limit(50)
      .select('name uom category');
    const ql = q.toLowerCase();
    const results = [
      ...found.filter((m) => m.name.toLowerCase().startsWith(ql)),
      ...found.filter((m) => !m.name.toLowerCase().startsWith(ql)),
    ].slice(0, 20);
    res.json({ total, results });
  } catch (err) {
    next(err);
  }
});

// ---- Admin-only mutations ----
router.post('/departments', requireRole('admin'), async (req, res, next) => {
  try {
    const { unitId, name, hasMinMax } = req.body;
    if (!unitId || !name) return res.status(400).json({ error: 'unitId and name required' });
    const dept = await Department.create({ unit: unitId, name, hasMinMax: !!hasMinMax });
    res.status(201).json(dept);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Department already exists in this unit' });
    next(err);
  }
});

router.put('/departments/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const dept = await Department.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!dept) return res.status(404).json({ error: 'Not found' });
    res.json(dept);
  } catch (err) {
    next(err);
  }
});

router.post('/categories', requireRole('admin'), async (req, res, next) => {
  try {
    const { departmentId, name, sortOrder } = req.body;
    if (!departmentId || !name) return res.status(400).json({ error: 'departmentId and name required' });
    const cat = await Category.create({ department: departmentId, name, sortOrder: sortOrder ?? 99 });
    res.status(201).json(cat);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Category already exists in this department' });
    next(err);
  }
});

router.put('/categories/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const cat = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!cat) return res.status(404).json({ error: 'Not found' });
    res.json(cat);
  } catch (err) {
    next(err);
  }
});

router.post('/items', requireRole('admin'), async (req, res, next) => {
  try {
    const { categoryId, name, uom, isPosLinked } = req.body;
    if (!categoryId || !name || !uom) return res.status(400).json({ error: 'categoryId, name, uom required' });
    const item = await Item.create({ category: categoryId, name, uom, isPosLinked: !!isPosLinked });
    await logAudit({ entityType: 'item', entityId: item._id, action: 'create', changedBy: req.user._id, newValue: { categoryId, name, uom } });
    res.status(201).json(item);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Item already exists in this category' });
    next(err);
  }
});

router.put('/items/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const item = await Item.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (err) {
    next(err);
  }
});

export default router;
