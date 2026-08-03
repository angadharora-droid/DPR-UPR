import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();

function publicUser(u) {
  return {
    id: u._id,
    name: u.name,
    email: u.email,
    loginId: u.loginId || '',
    phone: u.phone,
    role: u.role,
    unit: u.unit,
    department: u.department,
  };
}

router.post('/login', async (req, res, next) => {
  try {
    const { login, email, password } = req.body;
    const id = String(login || email || '').toLowerCase().trim();
    if (!id || !password) return res.status(400).json({ error: 'Login ID (or email) and password required' });
    const user = await User.findOne({ $or: [{ email: id }, { loginId: id }] })
      .populate('unit', 'name city')
      .populate('department', 'name hasMinMax');
    if (!user || !user.active) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    user.lastLogin = new Date();
    await user.save();
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES || '12h',
    });
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authRequired, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('unit', 'name city')
      .populate('department', 'name hasMinMax');
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/change-password', authRequired, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6)
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    const ok = await bcrypt.compare(currentPassword || '', req.user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Current password incorrect' });
    req.user.passwordHash = await bcrypt.hash(newPassword, 10);
    await req.user.save();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
