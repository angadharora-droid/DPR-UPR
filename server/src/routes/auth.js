import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { authRequired } from '../middleware/auth.js';
import { passwordRuleError, phoneKey } from '../utils/credentials.js';
import { verifySsoToken } from '../utils/ssoClient.js';
import { loginRateLimit, isLockedOut, recordFailure, clearFailures } from '../middleware/loginLimiter.js';

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

const withRefs = (q) => q.populate('unit', 'name city').populate('department', 'name hasMinMax');

// The identifier is an email (contains @), a local login ID, or — for admin
// accounts only — a phone number matched on its last 10 digits.
async function findByIdentifier(id) {
  if (id.includes('@')) return withRefs(User.findOne({ email: id }));
  const user = await withRefs(User.findOne({ loginId: id }));
  if (user) return user;
  const pk = phoneKey(id);
  if (!pk) return null;
  const admins = await withRefs(User.find({ role: 'admin' }));
  return admins.find((a) => phoneKey(a.phone) === pk) || null;
}

// Stamp the login and mint the app JWT. Shared by password login and central
// sign-on so both produce the same session and response body.
async function startSession(user) {
  user.lastLogin = new Date();
  await user.save();
  const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES || '12h',
  });
  return { token, user: publicUser(user) };
}

router.post('/login', loginRateLimit, async (req, res, next) => {
  try {
    const { identifier, login, email, password } = req.body;
    const id = String(identifier || login || email || '').toLowerCase().trim();
    if (!id || !password) return res.status(400).json({ error: 'Email (or phone number) and password required' });
    // One lockout counter per account no matter how the phone was formatted.
    const key = phoneKey(id) || id;
    if (isLockedOut(key))
      return res.status(429).json({ error: 'Too many failed attempts. Please try again later.' });
    const user = await findByIdentifier(id);
    if (!user || !user.active) {
      recordFailure(key);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      recordFailure(key);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    clearFailures(key);
    res.json(await startSession(user));
  } catch (err) {
    next(err);
  }
});

// Central sign-on: the browser brings a hand-off token from the portal's auth
// service, which tells us which local user (Mongo _id) it belongs to. Password
// login is unchanged; this always fails unless AUTH_SERVICE_URL is set.
router.post('/sso', loginRateLimit, async (req, res, next) => {
  try {
    const verified = await verifySsoToken(String(req.body?.token || ''));
    if (!verified) return res.status(401).json({ error: 'SSO sign-in failed' });
    const user = mongoose.isValidObjectId(verified.localUserId)
      ? await withRefs(User.findById(verified.localUserId))
      : null;
    if (!user || !user.active) return res.status(404).json({ error: 'No account linked' });
    res.json(await startSession(user));
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
    const ruleError = passwordRuleError(req.user.role, newPassword);
    if (ruleError) return res.status(400).json({ error: ruleError });
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
