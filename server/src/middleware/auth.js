import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    User.findById(payload.id)
      .then((user) => {
        if (!user || !user.active) return res.status(401).json({ error: 'User inactive or not found' });
        req.user = user;
        next();
      })
      .catch(next);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

// Ensures non-admin users only touch their own unit. Admin passes through.
export function sameUnitOr403(req, res, unitId) {
  if (req.user.role === 'admin') return true;
  if (!req.user.unit || String(req.user.unit) !== String(unitId)) {
    res.status(403).json({ error: 'Forbidden: wrong unit' });
    return false;
  }
  return true;
}
