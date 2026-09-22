// Drop-in client for the central sign-on service (ESM port of
// Meeting Os/auth/integration/node/ssoClient.js). Set AUTH_SERVICE_URL,
// SSO_APP_KEY and SSO_SHARED_SECRET; SSO stays off while AUTH_SERVICE_URL is empty.
import crypto from 'crypto';

const AUTH_SERVICE_URL = String(process.env.AUTH_SERVICE_URL || '').replace(/\/+$/, '');
const SSO_APP_KEY = process.env.SSO_APP_KEY || 'procurement-model';
const SSO_SHARED_SECRET = process.env.SSO_SHARED_SECRET || '';

export function ssoEnabled() {
  return Boolean(AUTH_SERVICE_URL);
}

// Exchanges a hand-off token (from the browser) for the local user it belongs to.
// Resolves to { localUserId, centralId, name, role } or null when the token is not valid for this app.
export async function verifySsoToken(token) {
  if (!ssoEnabled() || !token) return null;
  try {
    const response = await fetch(`${AUTH_SERVICE_URL}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-SSO-App': SSO_APP_KEY },
      body: JSON.stringify({ token }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok || data.app !== SSO_APP_KEY) return null;
    return { localUserId: data.localUserId, centralId: data.centralId, name: data.name, role: data.role };
  } catch (err) {
    console.error('SSO verify failed:', err.message);
    return null;
  }
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

// Guards the user-directory endpoint the auth service calls when the admin matches accounts.
export function directoryGuard(req, res, next) {
  if (!SSO_SHARED_SECRET || !safeEqual(req.get('X-SSO-Secret') || '', SSO_SHARED_SECRET)) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }
  return next();
}

export { SSO_APP_KEY };
export default { ssoEnabled, verifySsoToken, directoryGuard, SSO_APP_KEY };
