// API host comes from the build environment when set (e.g. VITE_API_URL=
// https://dprupr.centrepointgroup.in on Vercel); empty = same-origin /api,
// which covers local dev (Vite proxy), the single Railway service, and the
// vercel.json rewrite fallback.
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '') + '/api';

export function getToken() {
  return localStorage.getItem('token');
}

export async function api(path, { method = 'GET', body, formData } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: formData ? formData : body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    // Login attempts (password or SSO hand-off) report their own failure; only
    // an expired session mid-app should bounce to /login.
    if (!path.startsWith('/auth/login') && !path.startsWith('/auth/sso')) window.location.href = '/login';
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function downloadPdf(uprId, fileName) {
  const res = await fetch(`${BASE}/upr/${uprId}/pdf`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Download failed');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || 'upr.pdf';
  a.click();
  URL.revokeObjectURL(url);
}
