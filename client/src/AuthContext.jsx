import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';
import { resolveSsoToken, ssoEnabled, ssoLogout } from './sso';

const AuthContext = createContext(null);

const ROLES = ['admin', 'unit_head', 'dept_head', 'purchase_head'];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    // Other dev servers share the localhost origin, so localStorage may hold
    // a foreign or stale user; an unknown role would loop /login into itself.
    try {
      const u = JSON.parse(localStorage.getItem('user'));
      return u && ROLES.includes(u.role) ? u : null;
    } catch {
      return null;
    }
  });

  // Central sign-on: with no local session and VITE_AUTH_URL set, ask the portal
  // for a hand-off token before the login page is shown. Starts false when SSO
  // is off, so the normal flow is untouched.
  const [ssoChecking, setSsoChecking] = useState(() => !user && ssoEnabled());

  useEffect(() => {
    if (!ssoChecking) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const token = await resolveSsoToken();
        if (!cancelled && token) {
          const data = await api('/auth/sso', { method: 'POST', body: { token } });
          if (!cancelled && data?.token && data.user) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            setUser(data.user);
          }
        }
      } catch {
        /* not linked or auth service unreachable; fall through to the login page */
      }
      if (!cancelled) setSsoChecking(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(loginId, password) {
    // `identifier` accepts an email, a local login ID, or (admins only) a phone number
    const data = await api('/auth/login', { method: 'POST', body: { identifier: loginId, password } });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  function logout() {
    // Also end the portal session, otherwise the next page load would sign
    // straight back in through SSO. No-op unless VITE_AUTH_URL is set.
    ssoLogout();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, ssoChecking, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function homeFor(user) {
  if (!user) return '/login';
  switch (user.role) {
    case 'admin':
      return '/admin';
    case 'unit_head':
      return '/unit';
    case 'dept_head':
      return '/dept';
    case 'purchase_head':
      return '/purchase';
    default:
      return '/login';
  }
}
