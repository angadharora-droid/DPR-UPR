import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, downloadPdf } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import Layout, { StatusBadge, ErrorNote, btn, inputCls } from '../components/Layout.jsx';

export default function History() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState(user.role === 'dept_head' ? 'dpr' : 'upr');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [unitId, setUnitId] = useState('');
  const [units, setUnits] = useState([]);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user.role === 'admin') api('/admin/units').then(setUnits).catch(() => {});
  }, []);

  function search() {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    if (unitId) qs.set('unitId', unitId);
    api(`/${tab}/history?${qs}`).then(setRows).catch((e) => setError(e.message));
  }
  useEffect(search, [tab]);

  return (
    <Layout title="History" subtitle="Past DPRs and UPRs, searchable by date and unit">
      <ErrorNote error={error} />
      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        {user.role !== 'purchase_head' && (
          <div className="flex rounded-lg overflow-hidden border border-line" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'dpr'}
              className={`px-4 py-1.5 text-sm transition-colors ${tab === 'dpr' ? 'bg-brand text-white' : 'bg-surface hover:bg-paper'}`}
              onClick={() => setTab('dpr')}
            >
              DPRs
            </button>
            <button
              role="tab"
              aria-selected={tab === 'upr'}
              className={`px-4 py-1.5 text-sm transition-colors ${tab === 'upr' ? 'bg-brand text-white' : 'bg-surface hover:bg-paper'}`}
              onClick={() => setTab('upr')}
            >
              UPRs
            </button>
          </div>
        )}
        <div>
          <label className="block text-xs text-ink-soft mb-1">From</label>
          <input className={inputCls} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-ink-soft mb-1">To</label>
          <input className={inputCls} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {user.role === 'admin' && (
          <div>
            <label className="block text-xs text-ink-soft mb-1">Unit</label>
            <select className={inputCls} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">All units</option>
              {units.map((u) => (
                <option key={u._id} value={u._id}>{u.name}</option>
              ))}
            </select>
          </div>
        )}
        <button className={btn('green')} onClick={search}>Search</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Date</th>
              <th>Unit</th>
              {tab === 'dpr' && <th>Department</th>}
              <th>Status</th>
              <th>{tab === 'dpr' ? 'Signed by' : 'Sent to'}</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id}>
                <td className="font-mono text-[13px]">{r.cycleDate}</td>
                <td>{r.unit?.name || '—'}</td>
                {tab === 'dpr' && <td>{r.department?.name}</td>}
                <td><StatusBadge status={r.status} /></td>
                <td className="text-ink-soft">{tab === 'dpr' ? r.hodSignName || '—' : r.sentToEmail || '—'}</td>
                <td className="text-right">
                  {tab === 'dpr' ? (
                    <button className={btn('primary') + ' px-2.5 py-1 text-xs'} onClick={() => navigate(`/dept/dpr/${r._id}`)}>Open</button>
                  ) : (
                    r.status !== 'draft' && (
                      <button
                        className={btn('primary') + ' px-2.5 py-1 text-xs'}
                        onClick={() => downloadPdf(r._id, `UPR-${r.unit?.name}-${r.cycleDate}.pdf`).catch((e) => setError(e.message))}
                      >
                        PDF
                      </button>
                    )
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={6} className="text-center text-ink-faint py-8">Nothing in this range — widen the dates or switch tabs.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
