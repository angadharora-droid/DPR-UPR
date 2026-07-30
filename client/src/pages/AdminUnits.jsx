import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Layout, { ErrorNote, btn, inputCls } from '../components/Layout.jsx';

export default function AdminUnits() {
  const [units, setUnits] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api('/admin/units').then(setUnits).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function save() {
    setBusy(true);
    setError('');
    try {
      await api('/admin/units', { method: 'POST', body: form });
      setForm(null);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(u) {
    try {
      await api(`/admin/units/${u._id}`, { method: 'PUT', body: { active: !u.active } });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <Layout
      title="Units"
      subtitle="Cafes, restaurants and properties under the group"
      actions={<button className={btn('green')} onClick={() => setForm({ name: '', city: '', cloneFromUnitId: '' })}>+ Add unit</button>}
    >
      <ErrorNote error={error} />
      {form && (
        <div className="card p-4 mb-4 grid md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs text-ink-soft mb-1">Name</label>
            <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs text-ink-soft mb-1">City</label>
            <input className={inputCls} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs text-ink-soft mb-1">Setup</label>
            <select className={inputCls} value={form.cloneFromUnitId} onChange={(e) => setForm({ ...form, cloneFromUnitId: e.target.value })}>
              <option value="">Standard master (default depts + categories)</option>
              {units.map((u) => (
                <option key={u._id} value={u._id}>Clone full setup from: {u.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button className={btn('green')} onClick={save} disabled={busy || !form.name}>Create unit</button>
            <button className={btn('subtle')} onClick={() => setForm(null)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="card overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>City</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={u._id}>
                <td className="font-medium">{u.name}</td>
                <td className="text-ink-soft">{u.city}</td>
                <td>
                  <span className={`stamp ${u.active ? 'stamp-ok' : 'stamp-neutral'}`}>{u.active ? 'Active' : 'Inactive'}</span>
                </td>
                <td className="text-right">
                  <button className={btn('subtle') + ' px-2.5 py-1 text-xs'} onClick={() => toggleActive(u)}>
                    {u.active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
            {!units.length && <tr><td colSpan={4} className="text-center text-ink-faint py-8">No units yet — add the first cafe above.</td></tr>}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
