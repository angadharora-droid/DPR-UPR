// Brute-force guards for /auth/login. In-memory and per-process: counters
// reset on restart, which is acceptable for this single-service deployment
// but must move to a shared store if the API is ever scaled horizontally.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_IP = 30; // any login attempts, per IP, per window
const MAX_FAILS_PER_ID = 5; // consecutive failures per identifier
const LOCK_MS = 15 * 60 * 1000;

const ipHits = new Map(); // ip -> { count, resetAt }
const idFails = new Map(); // identifier key -> { count, lockedUntil }

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of ipHits) if (v.resetAt <= now) ipHits.delete(k);
  for (const [k, v] of idFails) if (v.lockedUntil <= now && v.count >= MAX_FAILS_PER_ID) idFails.delete(k);
}, WINDOW_MS).unref();

export function loginRateLimit(req, res, next) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const hit = ipHits.get(ip);
  if (!hit || hit.resetAt <= now) {
    ipHits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }
  hit.count += 1;
  if (hit.count > MAX_ATTEMPTS_PER_IP)
    return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
  next();
}

export function isLockedOut(key) {
  const f = idFails.get(key);
  return !!f && f.count >= MAX_FAILS_PER_ID && f.lockedUntil > Date.now();
}

export function recordFailure(key) {
  const f = idFails.get(key);
  if (!f || (f.count >= MAX_FAILS_PER_ID && f.lockedUntil <= Date.now())) {
    idFails.set(key, { count: 1, lockedUntil: 0 });
    return;
  }
  f.count += 1;
  if (f.count >= MAX_FAILS_PER_ID) f.lockedUntil = Date.now() + LOCK_MS;
}

export function clearFailures(key) {
  idFails.delete(key);
}
