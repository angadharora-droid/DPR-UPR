import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import Layout, { StatusBadge, ErrorNote, Stat, btn } from '../components/Layout.jsx';

export default function DeptDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState(null);
  const [cycleDate, setCycleDate] = useState('');
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/dpr/current')
      .then((d) => {
        setCurrent(d.dpr);
        setCycleDate(d.cycleDate);
      })
      .catch((e) => setError(e.message));
    api('/dpr/history')
      .then(setHistory)
      .catch(() => {});
  }, []);

  async function createDpr() {
    setBusy(true);
    setError('');
    try {
      const dpr = await api('/dpr', { method: 'POST' });
      navigate(`/dept/dpr/${dpr._id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const submittedCount = history.filter((d) => d.status === 'submitted').length;
  const lastSigned = history.find((d) => d.hodSignDate);

  return (
    <Layout
      title={user.department?.name || 'Department'}
      subtitle={`${user.unit?.name || ''} · today is ${cycleDate}`}
      actions={
        !current ? (
          <button className={btn('green')} onClick={createDpr} disabled={busy}>
            {busy ? 'Creating…' : "+ Start today's DPR"}
          </button>
        ) : (
          <button className={btn(current.status === 'draft' ? 'green' : 'subtle')} onClick={() => navigate(`/dept/dpr/${current._id}`)}>
            {current.status === 'draft' ? 'Continue DPR' : 'View DPR'}
          </button>
        )
      }
    >
      <ErrorNote error={error} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="card px-4 py-3.5">
          <div className="text-xs text-ink-faint">Today's DPR</div>
          <div className="mt-1.5"><StatusBadge status={current ? current.status : 'pending'} /></div>
          <div className="mt-1 text-xs text-ink-soft">
            {current?.status === 'submitted'
              ? `Signed ${new Date(current.hodSignDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : current?.status === 'draft'
                ? 'In progress'
                : 'Not started'}
          </div>
        </div>
        <Stat label="Items today" value={current ? current.lines.length : '—'} sub={current ? 'in the requisition' : 'create the DPR first'} />
        <Stat label="DPRs filed" value={history.length} sub="all time" />
        <Stat label="Last signed" value={lastSigned ? lastSigned.cycleDate.slice(5) : '—'} sub={lastSigned ? `by ${lastSigned.hodSignName}` : 'nothing signed yet'} />
      </div>

      {!current && (
        <div className="card p-5 mb-6 flex items-center justify-between gap-4">
          <div>
            <div className="font-medium">Start today's requisition</div>
            <p className="text-sm text-ink-soft mt-0.5">
              {user.department?.hasMinMax === false
                ? 'It starts blank — add items under each category.'
                : 'It starts blank — then import the POS min-max file (Excel/CSV) to fill it in one click.'}
            </p>
          </div>
          <button className={btn('green') + ' shrink-0'} onClick={createDpr} disabled={busy}>
            {busy ? 'Creating…' : 'Start DPR'}
          </button>
        </div>
      )}

      <h2 className="text-sm font-semibold mb-2">Past DPRs</h2>
      <div className="card overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>Date</th>
              <th>Status</th>
              <th>Signed by</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {history.map((d) => (
              <tr key={d._id}>
                <td><span className="num">{d.cycleDate}</span></td>
                <td><StatusBadge status={d.status} /></td>
                <td className="text-ink-soft">{d.hodSignName || '—'}</td>
                <td className="text-right">
                  <button className={btn('primary') + ' px-2.5 py-1 text-xs'} onClick={() => navigate(`/dept/dpr/${d._id}`)}>
                    Open
                  </button>
                </td>
              </tr>
            ))}
            {!history.length && (
              <tr><td colSpan={4} className="text-center text-ink-faint py-8">No DPRs filed yet — today's will be the first.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
