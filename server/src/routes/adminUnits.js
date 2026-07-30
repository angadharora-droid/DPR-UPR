import { Router } from 'express';
import Unit from '../models/Unit.js';
import Department from '../models/Department.js';
import Category from '../models/Category.js';
import Item from '../models/Item.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { logAudit } from '../services/audit.js';
import { DEPARTMENT_MASTER } from '../masterData.js';

const router = Router();
router.use(authRequired, requireRole('admin'));

router.get('/', async (req, res, next) => {
  try {
    res.json(await Unit.find().sort({ name: 1 }));
  } catch (err) {
    next(err);
  }
});

// Create a unit. Seeds departments+categories from the group master,
// or clones full dept/category/item setup from an existing unit (cloneFromUnitId).
router.post('/', async (req, res, next) => {
  try {
    const { name, city, cloneFromUnitId } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const unit = await Unit.create({ name, city });

    if (cloneFromUnitId) {
      const srcDepts = await Department.find({ unit: cloneFromUnitId });
      for (const sd of srcDepts) {
        const nd = await Department.create({
          unit: unit._id, name: sd.name, hasMinMax: sd.hasMinMax, active: sd.active,
        });
        const srcCats = await Category.find({ department: sd._id });
        for (const sc of srcCats) {
          const nc = await Category.create({
            department: nd._id, name: sc.name, sortOrder: sc.sortOrder, active: sc.active,
          });
          const srcItems = await Item.find({ category: sc._id });
          if (srcItems.length) {
            await Item.insertMany(srcItems.map((si) => ({
              category: nc._id, name: si.name, uom: si.uom, isPosLinked: si.isPosLinked, active: si.active,
            })));
          }
        }
      }
    } else {
      for (const dm of DEPARTMENT_MASTER) {
        const dept = await Department.create({ unit: unit._id, name: dm.name, hasMinMax: dm.hasMinMax });
        await Category.insertMany(
          dm.categories.map((c, i) => ({ department: dept._id, name: c, sortOrder: i }))
        );
      }
    }

    await logAudit({ entityType: 'unit', entityId: unit._id, action: 'create', changedBy: req.user._id, newValue: { name, city, cloneFromUnitId } });
    res.status(201).json(unit);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const unit = await Unit.findById(req.params.id);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });
    const old = { name: unit.name, city: unit.city, active: unit.active };
    const { name, city, active } = req.body;
    if (name !== undefined) unit.name = name;
    if (city !== undefined) unit.city = city;
    if (active !== undefined) unit.active = active;
    await unit.save();
    await logAudit({ entityType: 'unit', entityId: unit._id, action: 'update', changedBy: req.user._id, oldValue: old, newValue: req.body });
    res.json(unit);
  } catch (err) {
    next(err);
  }
});

export default router;
