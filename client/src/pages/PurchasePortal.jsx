import { useEffect, useState } from 'react';
import { api, downloadPdf } from '../api.js';
import Layout, { StatusBadge, ErrorNote, EmptyState, inputCls, btn } from '../components/Layout.jsx';

export default function PurchasePortal() {
  const [rows, setRows] = useState([]);
  const [units, setUnits] = useState([]);
  const [unitId, setUnitId] = useState('');
  const [error, setError] = useState('');

  function load() {
    const qs = new URLSearchParams({ status: 'sent' });
    if (unitId) qs.set('unitId', unitId);
    api(`/upr/history?${qs}`)
      .then((r) => {
        setRows(r);
        const seen = new Map();
        r.forEach((x) => x.unit && seen.set(x.unit._id, x.unit));
        setUnits((prev) => (prev.length ? prev : [...seen.values()]));
      })
      .catch((e) => setError(e.message));
  }
  useEffect(load, [unitId]);

  return (
    <Layout
      title="Incoming UPRs"
      subtitle="Verified requisitions from every unit, newest first"
      actions={
        <select className={inputCls + ' w-44'} value={unitId} onChange={(e) => setUnitId(e.target.value)} aria-label="Filter by unit">
          <option value="">All units</option>
          {units.map((u) => (
            <option key={u._id} value={u._id}>{u.name}</option>
          ))}
        </select>
      }
    >
      <ErrorNote error={error} />
      <div className="card overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>Date</th>
              <th>Unit</th>
              <th>Status</th>
              <th>Verified by</th>
              <th>Sent at</th>
              <th className="text-right">PDF</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id}>
                <td className="font-mono text-[13px]">{r.cycleDate}</td>
                <td className="font-medium">{r.unit?.name}{r.unit?.city ? `, ${r.unit.city}` : ''}</td>
                <td><StatusBadge status={r.status} /></td>
                <td className="text-ink-soft">{r.verifiedSignName || r.createdBy?.name || '—'}</td>
                <td className="text-ink-soft font-mono text-[13px]">{r.sentAt ? new Date(r.sentAt).toLocaleString() : '—'}</td>
                <td className="text-right">
                  <button
                    className={btn('primary')}
                    onClick={() => downloadPdf(r._id, `UPR-${r.unit?.name}-${r.cycleDate}.pdf`).catch((e) => setError(e.message))}
                  >
                    Download
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="p-6">
            <EmptyState title="No UPRs received yet" hint="When a unit head verifies and sends a requisition, it lands here with its PDF." />
          </div>
        )}
      </div>
    </Layout>
  );
}
