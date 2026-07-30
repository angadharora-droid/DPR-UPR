import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import Layout, { StatusBadge, ErrorNote, Stat, btn } from '../components/Layout.jsx';

const PIPELINE = ['pending', 'draft', 'verified', 'sent'];
const PIPELINE_LABELS = { pending: 'DPRs in', draft: 'Consolidated', verified: 'Verified', sent: 'Sent' };

export default function UnitDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    api('/upr/dashboard').then(setData).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function reopen(dprId, deptName) {
    if (!window.confirm(`Send the ${deptName} DPR back to the Department Head for re-editing?`)) return;
    setBusy(true);
    try {
      await api(`/dpr/${dprId}/reopen`, { method: 'POST' });
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function consolidate() {
    setBusy(true);
    setError('');
    try {
      await api('/upr/consolidate', { method: 'POST' });
      navigate('/unit/upr');
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  const total = data?.departments.length || 0;
  const submittedCount = data?.departments.filter((d) => d.dprStatus === 'submitted').length || 0;
  const pendingCount = data?.departments.filter((d) => d.dprStatus === 'pending').length || 0;
  const uprStage = data?.upr ? data.upr.status : 'pending';
  const stageIdx = PIPELINE.indexOf(uprStage === 'draft' ? 'draft' : uprStage);

  return (
    <Layout
      title={user.unit?.name || 'Unit'}
      subtitle={`Today's cycle · ${data?.cycleDate || ''}`}
      actions={
        data?.upr ? (
          <button className={btn('green')} onClick={() => navigate('/unit/upr')}>
            Open UPR
          </button>
        ) : (
          <button className={btn('green')} onClick={consolidate} disabled={busy || !submittedCount}>
            {submittedCount ? `Consolidate ${submittedCount} DPR(s)` : 'Waiting for DPRs'}
          </button>
        )
      }
    >
      <ErrorNote error={error} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="DPRs submitted" value={`${submittedCount} / ${total}`} sub={pendingCount ? `${pendingCount} still pending` : 'all departments in'} />
        <div className="card px-4 py-3.5">
          <div className="text-xs text-ink-faint">UPR status</div>
          <div className="mt-1.5"><StatusBadge status={uprStage === 'draft' ? 'draft' : uprStage} /></div>
          <div className="mt-1 text-xs text-ink-soft">
            {data?.upr ? (data.upr.status === 'draft' ? 'ready to review' : data.upr.status === 'verified' ? 'ready to send' : 'done for today') : 'not consolidated yet'}
          </div>
        </div>
        <div className="card px-4 py-3.5 col-span-2">
          <div className="text-xs text-ink-faint mb-2.5">Today's pipeline</div>
          <ol className="flex items-center">
            {PIPELINE.map((step, i) => {
              const reached = i <= stageIdx && (data?.upr || i === 0);
              return (
                <li key={step} className="flex items-center flex-1 last:flex-none">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`grid place-items-center w-5 h-5 rounded-full text-[10px] font-semibold num shrink-0 ${
                        reached ? 'bg-brand text-white' : 'bg-line-soft text-ink-faint'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className={`text-[11px] font-medium whitespace-nowrap ${reached ? 'text-brand-deep' : 'text-ink-faint'}`}>
                      {PIPELINE_LABELS[step]}
                    </span>
                  </span>
                  {i < PIPELINE.length - 1 && (
                    <span className={`h-0.5 flex-1 mx-2 rounded ${i < stageIdx ? 'bg-brand' : 'bg-line-soft'}`} />
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <h2 className="text-sm font-semibold mb-2">Departments</h2>
      <div className="card overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>Department</th>
              <th>DPR status</th>
              <th>Signed by</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.departments.map((d) => (
              <tr key={d.id}>
                <td className="font-medium">
                  {d.name}
                  {!d.hasMinMax && <span className="ml-2 text-[11px] text-ink-faint">manual · no POS feed</span>}
                </td>
                <td><StatusBadge status={d.dprStatus} /></td>
                <td className="text-ink-soft">
                  {d.hodSignName ? `${d.hodSignName} · ${new Date(d.hodSignDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '—'}
                </td>
                <td className="text-right space-x-2">
                  {d.dprId && (
                    <button className={btn('primary') + ' px-2.5 py-1 text-xs'} onClick={() => navigate(`/dept/dpr/${d.dprId}`)}>
                      View
                    </button>
                  )}
                  {d.dprStatus === 'submitted' && (!data.upr || data.upr.status === 'draft') && (
                    <button className={btn('subtle') + ' px-2.5 py-1 text-xs'} disabled={busy} onClick={() => reopen(d.dprId, d.name)}>
                      Send back
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink-faint">
        Consolidate pulls all submitted DPRs into one UPR. Departments that submit later can be pulled in with
        "Refresh from DPRs" on the UPR screen while it's still a draft.
      </p>
    </Layout>
  );
}
