import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, homeFor } from '../AuthContext.jsx';
import { btn, inputCls, ErrorNote } from '../components/Layout.jsx';

const STEPS = [
  ['Departments file DPRs', 'Kitchen, bar and housekeeping raise their daily requisition.'],
  ['Unit Head verifies', 'One consolidated UPR per unit, checked and signed.'],
  ['Purchase Head receives', 'PDF lands in the inbox, same day.'],
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(loginId, password);
      navigate(homeFor(user), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-[1fr_1fr]">
      {/* Brand panel */}
      <div className="relative overflow-hidden bg-slate-950 text-white px-8 py-10 md:px-14 md:py-12 flex flex-col">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-indigo-600/30 blur-3xl" aria-hidden="true" />
        <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-violet-600/20 blur-3xl" aria-hidden="true" />
        <div className="relative flex items-center gap-3">
          <span className="grid place-items-center w-9 h-9 rounded-xl bg-brand text-white font-bold text-sm">CP</span>
          <span className="text-sm font-semibold">CPH Requisitions</span>
        </div>
        <div className="relative my-auto py-12 max-w-md">
          <h1 className="text-3xl md:text-[34px] font-semibold leading-tight tracking-tight">
            Daily purchase requisitions, without the spreadsheets.
          </h1>
          <div className="mt-10 space-y-6">
            {STEPS.map(([t, d], i) => (
              <div key={t} className="flex gap-3.5">
                <span className="grid place-items-center w-7 h-7 rounded-full bg-white/10 text-[12px] font-semibold shrink-0 num">
                  {i + 1}
                </span>
                <div>
                  <div className="text-sm font-medium">{t}</div>
                  <div className="text-sm text-slate-400 mt-0.5">{d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-6 py-12 bg-paper">
        <form onSubmit={onSubmit} className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold tracking-tight mb-1">Welcome back</h2>
          <p className="text-sm text-ink-soft mb-6">Sign in with the account your admin set up.</p>
          <ErrorNote error={error} />
          <label className="block text-sm font-medium mb-1.5" htmlFor="loginId">Email or phone number</label>
          <input id="loginId" className={inputCls + ' mb-1.5 py-2'} type="text" value={loginId} onChange={(e) => setLoginId(e.target.value)} required autoFocus autoComplete="username" />
          <p className="text-xs text-ink-faint mb-4">Phone number sign-in is available for admin accounts only.</p>
          <label className="block text-sm font-medium mb-1.5" htmlFor="password">Password</label>
          <input id="password" className={inputCls + ' mb-6 py-2'} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          <button className={btn('green') + ' w-full py-2.5'} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
