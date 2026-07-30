import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User, { ROLES } from '../models/User.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { logAudit } from '../services/audit.js';

const router = Router();
router.use(authRequired, requireRole('admin'));

router.get('/', async (req, res, next) => {
  try {
    const users = await User.find()
      .select('-passwordHash')
      .populate('unit', 'name')
      .populate('department', 'name')
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, email, phone, role, unitId, departmentId, password } = req.body;
    if (!name || !email || !role || !password)
      return res.status(400).json({ error: 'name, email, role, password required' });
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
    if ((role === 'dept_head' || role === 'unit_head') && !unitId)
      return res.status(400).json({ error: 'Unit required for this role' });
    if (role === 'dept_head' && !departmentId)
      return res.status(400).json({ error: 'Department required for Department Head' });
    const user = await User.create({
      name,
      email,
      phone,
      role,
      unit: unitId || null,
      department: role === 'dept_head' ? departmentId : null,
      passwordHash: await bcrypt.hash(password, 10),
    });
    await logAudit({ entityType: 'user', entityId: user._id, action: 'create', changedBy: req.user._id, newValue: { name, email, role, unitId, departmentId } });
    res.status(201).json({ id: user._id });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Email already in use' });
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const old = { name: user.name, email: user.email, phone: user.phone, role: user.role, unit: user.unit, department: user.department, active: user.active };
    const { name, email, phone, role, unitId, departmentId, active, password } = req.body;
    if (name !== undefined) user.name = name;
    if (email !== undefined) user.email = email;
    if (phone !== undefined) user.phone = phone;
    if (role !== undefined) {
      if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
      user.role = role;
    }
    if (unitId !== undefined) user.unit = unitId || null;
    if (departmentId !== undefined) user.department = departmentId || null;
    if (active !== undefined) user.active = active;
    if (password) user.passwordHash = await bcrypt.hash(password, 10);
    await user.save();
    await logAudit({ entityType: 'user', entityId: user._id, action: password ? 'update+password-reset' : 'update', changedBy: req.user._id, oldValue: old, newValue: { name, email, phone, role, unitId, departmentId, active } });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Email already in use' });
    next(err);
  }
});

export default router;
