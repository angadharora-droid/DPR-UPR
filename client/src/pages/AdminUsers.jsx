import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import Layout, { ErrorNote, btn, inputCls } from '../components/Layout.jsx';

const ROLE_OPTIONS = [
  ['dept_head', 'Department Head'],
  ['unit_head', 'Unit Head'],
  ['purchase_head', 'Purchase Head'],
  ['admin', 'Admin'],
];

const EMPTY = { name: '', email: '', loginId: '', phone: '', role: 'dept_head', unitId: '', departmentId: '', password: '' };

// Mirrors the server rule: admins may use a 4/6-digit PIN, others need 8+ chars.
function passwordOk(role, pw) {
  if (role === 'admin') return /^\d{4}$/.test(pw) || /^\d{6}$/.test(pw) || pw.length >= 8;
  return pw.length >= 8;
}

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [units, setUnits] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    api('/admin/users').then(setUsers).catch((e) => setError(e.message));
    api('/admin/units').then(setUnits).catch(() => {});
  }
  useEffect(load, []);

  useEffect(() => {
    if (form?.unitId && form.role === 'dept_head') {
      api(`/master/departments?unitId=${form.unitId}`).then(setDepartments).catch(() => setDepartments([]));
    } else {
      setDepartments([]);
    }
  }, [form?.unitId, form?.role]);

  const needsUnit = form && (form.role === 'dept_head' || form.role === 'unit_head');

  // The UPR recipient: the oldest active Purchase Head user — same rule the
  // server uses when it resolves the send address.
  const purchaseHead = useMemo(() => {
    const phs = users.filter((u) => u.role === 'purchase_head' && u.active);
    phs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    return phs[0] || null;
  }, [users]);
  const [phEmail, setPhEmail] = useState('');
  const [phNote, setPhNote] = useState('');
  useEffect(() => {
    setPhEmail(purchaseHead?.email || '');
  }, [purchaseHead?._id, purchaseHead?.email]);

  async function savePhEmail() {
    const email = phEmail.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter a valid email address');
    setBusy(true);
    setError('');
    setPhNote('');
    try {
      await api(`/admin/users/${purchaseHead._id}`, { method: 'PUT', body: { email } });
      setPhNote(`Saved — every UPR is now emailed to ${email}.`);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      if (editingId) {
        const body = { ...form };
        if (!body.password) delete body.password;
        await api(`/admin/users/${editingId}`, { method: 'PUT', body });
      } else {
        await api('/admin/users', { method: 'POST', body: form });
      }
      setForm(null);
      setEditingId(null);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(u) {
    try {
      await api(`/admin/users/${u._id}`, { method: 'PUT', body: { active: !u.active } });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  function startEdit(u) {
    setEditingId(u._id);
    setForm({
      name: u.name,
      email: u.email,
      loginId: u.loginId || '',
      phone: u.phone || '',
      role: u.role,
      unitId: u.unit?._id || '',
      departmentId: u.department?._id || '',
      password: '',
    });
  }

  return (
    <Layout
      title="Users"
      subtitle="Logins for department heads, unit heads and the purchase head"
      actions={<button className={btn('green')} onClick={() => { setForm({ ...EMPTY }); setEditingId(null); }}>+ Add user</button>}
    >
      <ErrorNote error={error} />

      <div className="card p-4 mb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold">UPR recipient — Purchase Head</h2>
            <p className="text-xs text-ink-faint mt-0.5">
              Every unit's UPR email goes to this address only. Change it here.
            </p>
          </div>
          {purchaseHead ? (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="block text-xs text-ink-soft mb-1" htmlFor="ph-recipient">
                  {purchaseHead.name}
                </label>
                <input
                  id="ph-recipient"
                  className={inputCls + ' md:w-80'}
                  type="email"
                  value={phEmail}
                  onChange={(e) => setPhEmail(e.target.value)}
                />
              </div>
              <button
                className={btn('green')}
                onClick={savePhEmail}
                disabled={busy || !phEmail.trim() || phEmail.trim().toLowerCase() === purchaseHead.email}
              >
                Save email
              </button>
            </div>
          ) : (
            <p className="text-sm text-ink-soft">
              No active Purchase Head user — add one below with role “Purchase Head”.
            </p>
          )}
        </div>
        {phNote && <p className="text-xs text-ok mt-2">{phNote}</p>}
      </div>

      {form && (
        <div className="card p-4 mb-4">
          <h2 className="font-display text-base font-semibold mb-3">{editingId ? 'Edit user' : 'New user'}</h2>
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-ink-soft mb-1">Name</label>
              <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-ink-soft mb-1">Email</label>
              <input className={inputCls} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-ink-soft mb-1">Login ID (optional — signs in instead of email)</label>
              <input className={inputCls} value={form.loginId} onChange={(e) => setForm({ ...form, loginId: e.target.value })} placeholder="e.g. kitchen.pablo" />
            </div>
            <div>
              <label className="block text-xs text-ink-soft mb-1">
                Phone{form.role === 'admin' ? ' (admins can sign in with this number)' : ''}
              </label>
              <input className={inputCls} type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="e.g. +91 98765 43210" />
            </div>
            <div>
              <label className="block text-xs text-ink-soft mb-1">Role</label>
              <select className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, departmentId: '' })}>
                {ROLE_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            {needsUnit && (
              <div>
                <label className="block text-xs text-ink-soft mb-1">Unit</label>
                <select className={inputCls} value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value, departmentId: '' })}>
                  <option value="">— select unit —</option>
                  {units.map((u) => (
                    <option key={u._id} value={u._id}>{u.name}</option>
                  ))}
                </select>
              </div>
            )}
            {form.role === 'dept_head' && (
              <div>
                <label className="block text-xs text-ink-soft mb-1">Department</label>
                <select className={inputCls} value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                  <option value="">— select department —</option>
                  {departments.map((d) => (
                    <option key={d._id} value={d._id}>{d.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs text-ink-soft mb-1">{editingId ? 'New password (blank = keep)' : 'Password'}</label>
              <input className={inputCls} type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <p className="text-[11px] text-ink-faint mt-1">
                {form.role === 'admin' ? '4-digit PIN, 6-digit PIN, or 8+ characters' : 'At least 8 characters'}
              </p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              className={btn('green')}
              onClick={save}
              disabled={busy || !form.name || !form.email || (form.password ? !passwordOk(form.role, form.password) : !editingId) || (needsUnit && !form.unitId) || (form.role === 'dept_head' && !form.departmentId)}
            >
              {editingId ? 'Save changes' : 'Create user'}
            </button>
            <button className={btn('subtle')} onClick={() => { setForm(null); setEditingId(null); }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Login ID</th>
              <th>Role</th>
              <th>Unit / dept</th>
              <th>Last login</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id}>
                <td className="font-medium">{u.name}</td>
                <td className="text-ink-soft">{u.email}</td>
                <td className="text-ink-soft font-mono text-xs">{u.loginId || '—'}</td>
                <td>{ROLE_OPTIONS.find(([v]) => v === u.role)?.[1] || u.role}</td>
                <td className="text-ink-soft">
                  {u.unit?.name || '—'}{u.department?.name ? ` / ${u.department.name}` : ''}
                </td>
                <td className="text-ink-faint text-xs font-mono">{u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'never'}</td>
                <td>
                  <span className={`stamp ${u.active ? 'stamp-ok' : 'stamp-neutral'}`}>{u.active ? 'Active' : 'Inactive'}</span>
                </td>
                <td className="text-right space-x-2">
                  <button className={btn('primary') + ' px-2.5 py-1 text-xs'} onClick={() => startEdit(u)}>Edit</button>
                  <button className={btn('subtle') + ' px-2.5 py-1 text-xs'} onClick={() => toggleActive(u)}>
                    {u.active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
