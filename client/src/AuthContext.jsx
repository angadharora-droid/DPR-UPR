import { createContext, useContext, useState } from 'react';
import { api } from './api';

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

  async function login(email, password) {
    const data = await api('/auth/login', { method: 'POST', body: { email, password } });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
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
