import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Layout, { ErrorNote, Note, btn, inputCls } from '../components/Layout.jsx';

export default function AdminUnits() {
  const [units, setUnits] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [mailForm, setMailForm] = useState(null);
  const [note, setNote] = useState('');
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

  async function saveMailbox() {
    setBusy(true);
    setError('');
    try {
      const smtpUser = mailForm.smtpUser.trim();
      const body = { smtpUser };
      if (mailForm.smtpPass) body.smtpPass = mailForm.smtpPass;
      await api(`/admin/units/${mailForm.unit._id}`, { method: 'PUT', body });
      setMailForm(null);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendTest(u) {
    setBusy(true);
    setError('');
    setNote('');
    try {
      const r = await api(`/admin/units/${u._id}/test-email`, { method: 'POST', body: {} });
      setNote(
        r.devMode
          ? 'Dev mode: SMTP is not configured on the server — no email was delivered.'
          : `Test email sent from ${r.from} to ${r.to} — check that inbox (and spam).`
      );
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
      {note && <Note tone="ok">{note}</Note>}
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
      {mailForm && (
        <div className="card p-4 mb-4 grid md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs text-ink-soft mb-1">Sender mailbox for {mailForm.unit.name}</label>
            <input className={inputCls} placeholder="e.g. pablo@centrepointgroup.in" value={mailForm.smtpUser} onChange={(e) => setMailForm({ ...mailForm, smtpUser: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs text-ink-soft mb-1">Mailbox password {mailForm.unit.smtpUser ? '(blank = keep current)' : ''}</label>
            <input className={inputCls} type="password" value={mailForm.smtpPass} onChange={(e) => setMailForm({ ...mailForm, smtpPass: e.target.value })} />
          </div>
          <div className="md:col-span-2 flex gap-2">
            <button className={btn('green')} onClick={saveMailbox} disabled={busy || (!!mailForm.smtpUser.trim() && !mailForm.smtpPass && !mailForm.unit.smtpUser)}>Save mailbox</button>
            <button className={btn('subtle')} onClick={() => setMailForm(null)}>Cancel</button>
            <span className="text-xs text-ink-faint self-center">Leave email empty to fall back to the group mailbox.</span>
          </div>
        </div>
      )}
      <div className="card overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>City</th>
              <th>Sender mailbox</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={u._id}>
                <td className="font-medium">{u.name}</td>
                <td className="text-ink-soft">{u.city}</td>
                <td className="text-ink-soft">{u.smtpUser || <span className="text-ink-faint">Group default</span>}</td>
                <td>
                  <span className={`stamp ${u.active ? 'stamp-ok' : 'stamp-neutral'}`}>{u.active ? 'Active' : 'Inactive'}</span>
                </td>
                <td className="text-right">
                  <button className={btn('subtle') + ' px-2.5 py-1 text-xs mr-1'} onClick={() => setMailForm({ unit: u, smtpUser: u.smtpUser || '', smtpPass: '' })}>
                    Mailbox
                  </button>
                  <button className={btn('subtle') + ' px-2.5 py-1 text-xs mr-1'} onClick={() => sendTest(u)} disabled={busy}>
                    Test email
                  </button>
                  <button className={btn('subtle') + ' px-2.5 py-1 text-xs'} onClick={() => toggleActive(u)}>
                    {u.active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
            {!units.length && <tr><td colSpan={5} className="text-center text-ink-faint py-8">No units yet — add the first cafe above.</td></tr>}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
