import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Layout, { ErrorNote, Note, btn, inputCls } from '../components/Layout.jsx';

export default function AdminImport() {
  const [units, setUnits] = useState([]);
  const [unitId, setUnitId] = useState('');
  const [departments, setDepartments] = useState([]);
  const [departmentId, setDepartmentId] = useState('');
  const [file, setFile] = useState(null);
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/admin/units').then((u) => {
      setUnits(u);
      if (u.length) setUnitId(u[0]._id);
    }).catch((e) => setError(e.message));
    loadRecent();
  }, []);

  useEffect(() => {
    if (!unitId) return;
    api(`/master/departments?unitId=${unitId}`).then((d) => {
      const withFeed = d.filter((x) => x.hasMinMax);
      setDepartments(withFeed);
      setDepartmentId(withFeed[0]?._id || '');
    }).catch(() => {});
  }, [unitId]);

  function loadRecent() {
    api('/minmax').then(setRecent).catch(() => {});
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('unitId', unitId);
      fd.append('departmentId', departmentId);
      fd.append('reportDate', reportDate);
      fd.append('file', file);
      const r = await api('/minmax/import', { method: 'POST', formData: fd });
      setResult(r);
      setFile(null);
      loadRecent();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout title="Min-max archive" subtitle="Central log of POS feeds — department heads import day-to-day on their DPR screen">
      <ErrorNote error={error} />
      {result && (
        <Note tone="ok">
          Imported {result.imported} rows ({result.itemsCreated} new items auto-created).
          {result.skipped?.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer">{result.skipped.length} row(s) skipped</summary>
              <ul className="list-disc ml-5 text-xs">{result.skipped.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </details>
          )}
        </Note>
      )}

      <div className="card p-4 mb-6">
        <div className="grid md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-xs text-ink-soft mb-1">Unit</label>
            <select className={inputCls} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              {units.map((u) => (
                <option key={u._id} value={u._id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-ink-soft mb-1">Department (min-max only)</label>
            <select className={inputCls} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              {departments.map((d) => (
                <option key={d._id} value={d._id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-ink-soft mb-1">Report date</label>
            <input className={inputCls} type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-ink-soft mb-1">POS file (Excel/CSV)</label>
            <input type="file" accept=".xlsx,.xls,.csv" className="text-sm" onChange={(e) => setFile(e.target.files[0] || null)} />
          </div>
          <button className={btn('green')} onClick={upload} disabled={busy || !file || !departmentId}>
            {busy ? 'Importing…' : 'Import file'}
          </button>
        </div>
        <p className="text-xs text-ink-faint mt-3">
          Columns (header row required): <code className="font-mono">Category, Item, UOM, Closing Stock, Buffer Days, Required Qty</code>.
          Unknown items are auto-created under the given category as POS-linked. HouseKeeping &amp; Maintenance never receives this feed.
        </p>
      </div>

      <h2 className="font-display text-base font-semibold mb-2">Recent imports</h2>
      <div className="card overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>Date</th>
              <th>Unit</th>
              <th>Department</th>
              <th>Source file</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((r) => (
              <tr key={r._id}>
                <td className="font-mono text-[13px]">{new Date(r.reportDate).toLocaleDateString()}</td>
                <td>{r.unit?.name}</td>
                <td>{r.department?.name}</td>
                <td className="text-ink-soft font-mono text-[13px]">{r.source}</td>
              </tr>
            ))}
            {!recent.length && <tr><td colSpan={4} className="text-center text-ink-faint py-8">No feeds imported yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
