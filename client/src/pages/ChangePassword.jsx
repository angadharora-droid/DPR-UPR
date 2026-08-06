import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import Layout, { ErrorNote, Note, btn, inputCls } from '../components/Layout.jsx';

// Admins may swap their password for a numeric PIN; everyone else keeps a
// full text password. The server enforces the same rules by role.
const MODES = [
  ['text', 'Text password'],
  ['pin4', '4-digit PIN'],
  ['pin6', '6-digit PIN'],
];
const PIN_LEN = { pin4: 4, pin6: 6 };

export default function ChangePassword() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [mode, setMode] = useState('text');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  const pinLen = PIN_LEN[mode];

  function switchMode(m) {
    setMode(m);
    setNewPassword('');
    setConfirm('');
    setError('');
  }

  function onNewValue(setter) {
    return (e) => {
      const v = pinLen ? e.target.value.replace(/\D/g, '').slice(0, pinLen) : e.target.value;
      setter(v);
    };
  }

  const newValid = pinLen ? newPassword.length === pinLen : newPassword.length >= 8;

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setDone('');
    if (!newValid)
      return setError(pinLen ? `PIN must be exactly ${pinLen} digits` : 'Password must be at least 8 characters');
    if (newPassword !== confirm)
      return setError(pinLen ? 'PINs do not match' : 'Passwords do not match');
    setBusy(true);
    try {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
      setDone(pinLen ? 'PIN saved — use it the next time you sign in.' : 'Password changed.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const newLabel = pinLen ? `New ${pinLen}-digit PIN` : 'New password';
  const pinProps = pinLen
    ? { inputMode: 'numeric', pattern: '[0-9]*', maxLength: pinLen, placeholder: '•'.repeat(pinLen) }
    : { minLength: 8 };

  return (
    <Layout title="Change password" subtitle="Update the credential you sign in with">
      <form onSubmit={onSubmit} className="card p-5 max-w-md">
        <ErrorNote error={error} />
        {done && <Note tone="ok">{done}</Note>}

        {isAdmin && (
          <div className="mb-4">
            <span className="block text-xs text-ink-soft mb-1.5">Credential type</span>
            <div className="inline-flex rounded-lg border border-line bg-surface p-0.5 shadow-sm">
              {MODES.map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                    mode === m ? 'bg-brand-soft text-brand-deep font-medium' : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-faint mt-1.5">
              A PIN works with phone-number sign-in — keep it private like a password.
            </p>
          </div>
        )}

        <label className="block text-xs text-ink-soft mb-1" htmlFor="current">Current password{isAdmin ? ' or PIN' : ''}</label>
        <input
          id="current"
          className={inputCls + ' mb-4'}
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          autoComplete="current-password"
        />

        <label className="block text-xs text-ink-soft mb-1" htmlFor="new">{newLabel}</label>
        <input
          id="new"
          className={inputCls + ' mb-1'}
          type="password"
          value={newPassword}
          onChange={onNewValue(setNewPassword)}
          required
          autoComplete="new-password"
          {...pinProps}
        />
        <p className="text-xs text-ink-faint mb-4">
          {pinLen ? `Exactly ${pinLen} digits (0–9).` : 'At least 8 characters.'}
        </p>

        <label className="block text-xs text-ink-soft mb-1" htmlFor="confirm">Confirm {pinLen ? 'PIN' : 'new password'}</label>
        <input
          id="confirm"
          className={inputCls + ' mb-5'}
          type="password"
          value={confirm}
          onChange={onNewValue(setConfirm)}
          required
          autoComplete="new-password"
          {...pinProps}
        />

        <button className={btn('green')} disabled={busy || !currentPassword || !newValid || newPassword !== confirm}>
          {busy ? 'Saving…' : pinLen ? 'Save PIN' : 'Change password'}
        </button>
      </form>
    </Layout>
  );
}
