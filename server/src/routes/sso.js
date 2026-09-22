import { Router } from 'express';
import User from '../models/User.js';
import { directoryGuard } from '../utils/ssoClient.js';

const router = Router();

// User directory for the central sign-on admin screen (account matching).
// `id` is the Mongo _id the /api/auth/sso route looks users up by. Only
// reachable with the shared secret; never exposes password hashes.
router.get('/users', directoryGuard, async (req, res, next) => {
  try {
    const users = await User.find({}, { name: 1, email: 1, loginId: 1, role: 1 })
      .sort({ createdAt: 1 })
      .lean();
    res.json(
      users.map((u) => ({
        id: String(u._id),
        name: u.name || u.loginId || '',
        email: u.email,
        role: u.role,
      }))
    );
  } catch (err) {
    next(err);
  }
});

export default router;
