import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import Layout, { StatusBadge, ErrorNote, EmptyState, btn, inputCls } from '../components/Layout.jsx';

export default function UprReview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [upr, setUpr] = useState(null);
  const [cycleDate, setCycleDate] = useState('');
  const [departments, setDepartments] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(null);
  const [deptFilter, setDeptFilter] = useState(null); // null = every department

  const editable = upr?.status === 'draft';

  // A line is "edited" while its live figures differ from the frozen copy of
  // what the department head submitted — set the value back and the pill goes.
  const num = (v) => Number(v || 0);
  const txt = (v) => String(v || '').trim();
  const isEdited = (l) =>
    l.sourceQty !== null && l.sourceQty !== undefined && (num(l.requiredQty) !== num(l.sourceQty) || txt(l.remark) !== txt(l.sourceRemark));

  function load() {
    api('/upr/current')
      .then((d) => {
        setUpr(d.upr);
        setCycleDate(d.cycleDate);
      })
      .catch((e) => setError(e.message));
    api('/master/departments').then(setDepartments).catch(() => {});
  }
  useEffect(load, []);

  const grouped = useMemo(() => {
    if (!upr) return [];
    const byDept = new Map();
    upr.lines.forEach((l) => {
      if (!byDept.has(l.departmentName)) byDept.set(l.departmentName, new Map());
      const byCat = byDept.get(l.departmentName);
      if (!byCat.has(l.categoryName)) byCat.set(l.categoryName, []);
      byCat.get(l.categoryName).push(l);
    });
    return [...byDept.entries()].map(([dept, byCat], i) => {
      const all = [...byCat.values()].flat();
      return {
        dept,
        colorIdx: i % 6, // fixed per department for this cycle, so filtering never re-colours a block
        count: all.length,
        edited: all.filter(isEdited).length,
        added: all.filter((l) => l.addedByUnitHead).length,
        cats: [...byCat.entries()].map(([cat, lines]) => ({ cat, lines })),
      };
    });
  }, [upr]);

  const touched = useMemo(
    () => ({
      edited: grouped.reduce((s, g) => s + g.edited, 0),
      added: grouped.reduce((s, g) => s + g.added, 0),
    }),
    [grouped]
  );

  // One department at a time. Falls back to all if the filtered department
  // leaves the UPR (e.g. its DPR was reopened while this screen was open).
  const showing = deptFilter && grouped.some((g) => g.dept === deptFilter) ? grouped.filter((g) => g.dept === deptFilter) : grouped;

  async function saveLine(line, patch) {
    try {
      await api(`/upr/${upr._id}/lines/${line._id}`, { method: 'PUT', body: patch });
      setUpr((u) => ({
        ...u,
        lines: u.lines.map((l) => (l._id === line._id ? { ...l, ...patch } : l)),
      }));
    } catch (e) {
      setError(e.message);
      load();
    }
  }

  async function removeLine(line) {
    if (!window.confirm(`Remove "${line.itemName}" from the UPR? (Tracked in audit log)`)) return;
    try {
      await api(`/upr/${upr._id}/lines/${line._id}`, { method: 'DELETE' });
      setUpr((u) => ({ ...u, lines: u.lines.filter((l) => l._id !== line._id) }));
    } catch (e) {
      setError(e.message);
    }
  }

  async function addLine() {
    try {
      await api(`/upr/${upr._id}/lines`, { method: 'POST', body: adding });
      setAdding(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function refresh() {
    setBusy(true);
    setError('');
    try {
      await api('/upr/consolidate', { method: 'POST' });
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!window.confirm(`Verify this UPR and sign as "${user.name}"?\n\nThis locks the UPR and generates the PDF. After this you can only send it — no more edits.`))
      return;
    setBusy(true);
    setError('');
    try {
      await api(`/upr/${upr._id}/verify`, { method: 'POST' });
      navigate(`/unit/upr/${upr._id}/send`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  if (!upr) {
    return (
      <Layout title="UPR review" subtitle={cycleDate}>
        <ErrorNote error={error} />
        <EmptyState
          title="No UPR for today yet"
          hint="Once departments submit their DPRs, consolidate them into one Unit Purchase Requisition from the dashboard."
        >
          <button className={btn('green')} onClick={() => navigate('/unit')}>Go to dashboard</button>
        </EmptyState>
      </Layout>
    );
  }

  return (
    <Layout
      title={`UPR — ${user.unit?.name}`}
      subtitle={
        `${upr.cycleDate} · ${upr.lines.length} line(s) across ${grouped.length} department(s)` +
        (touched.edited || touched.added
          ? ` · ${[touched.edited && `${touched.edited} edited`, touched.added && `${touched.added} added`].filter(Boolean).join(', ')} at unit level`
          : '')
      }
      actions={
        <>
          <StatusBadge status={upr.status} lg={upr.status !== 'draft'} />
          {editable && (
            <>
              <button className={btn('subtle')} onClick={refresh} disabled={busy}>Refresh from DPRs</button>
              <button className={btn('green')} onClick={verify} disabled={busy || !upr.lines.length}>Verify &amp; lock</button>
            </>
          )}
          {upr.status !== 'draft' && (
            <button className={btn('green')} onClick={() => navigate(`/unit/upr/${upr._id}/send`)}>
              {upr.status === 'verified' ? 'Send to Purchase Head' : 'View / download'}
            </button>
          )}
        </>
      }
    >
      <ErrorNote error={error} />
      {editable && (
        <p className="mb-4 text-sm text-ink-soft flex flex-wrap items-center gap-x-2 gap-y-1">
          Quantity and remark edits save on blur and are recorded in the audit log against the department head's original
          values. Lines you change are pilled
          <span className="stamp stamp-warn">edited</span>
          and lines you add
          <span className="stamp stamp-violet">added</span>
          — hover a pill to see what the department submitted.
        </p>
      )}

      {/* Department filter — click a pill to work through one department at a time */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`stamp stamp-plain ${deptFilter ? 'dept-pill-off' : 'stamp-info'}`}
          onClick={() => setDeptFilter(null)}
          aria-pressed={!deptFilter}
        >
          All departments · {upr.lines.length}
        </button>
        {grouped.map((g) => (
          <button
            key={g.dept}
            type="button"
            className={`stamp dept-${g.colorIdx} ${deptFilter === g.dept ? 'dept-pill' : 'dept-pill-off'}`}
            onClick={() => setDeptFilter(deptFilter === g.dept ? null : g.dept)}
            aria-pressed={deptFilter === g.dept}
          >
            {g.dept} · {g.count}
          </button>
        ))}
        {deptFilter && (
          <span className="text-xs text-ink-faint">
            showing 1 of {grouped.length} departments — Verify &amp; lock still covers all {upr.lines.length} lines
          </span>
        )}
      </div>

      {showing.map(({ dept, cats, count, edited, added, colorIdx }) => (
        <section key={dept} className={`card mb-6 overflow-hidden dept-${colorIdx} dept-edge`}>
          <div className="dept-head border-b border-line px-4 py-2.5 flex flex-wrap items-center gap-2">
            <span className="stamp dept-pill">{dept}</span>
            <span className="text-xs text-ink-faint">{count} line(s)</span>
            {edited > 0 && (
              <span className="stamp stamp-warn" title="Lines whose qty or remark you changed from what this department submitted">
                {edited} edited
              </span>
            )}
            {added > 0 && (
              <span className="stamp stamp-violet" title="Lines you added to this department at unit level">
                {added} added
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            {cats.map(({ cat, lines }) => (
              <div key={cat}>
                <div className="bg-paper border-y border-line-soft px-4 py-1.5 text-[11px] font-medium text-ink-faint">
                  {cat}
                </div>
                <table className="tbl tbl-dense">
                  <thead className="sr-only">
                    <tr>
                      <th>#</th><th>Item</th><th>UOM</th><th>Closing stock</th><th>Buffer days</th><th>Required qty</th><th>Remark</th>
                      {editable && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <LineRow key={l._id} line={l} index={i} edited={isEdited(l)} editable={editable} onSave={saveLine} onRemove={removeLine} />
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      ))}

      {editable && (
        <div className="card p-4">
          {!adding ? (
            <button
              className={btn('primary') + ' px-2.5 py-1 text-xs'}
              onClick={() => setAdding({ departmentId: departments[0]?._id || '', itemName: '', uom: '', requiredQty: 0, remark: '' })}
            >
              + Add item to UPR
            </button>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
              <div className="col-span-2">
                <label className="block text-xs text-ink-soft mb-1">Department</label>
                <select className={inputCls} value={adding.departmentId} onChange={(e) => setAdding({ ...adding, departmentId: e.target.value })}>
                  {departments.map((d) => (
                    <option key={d._id} value={d._id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-ink-soft mb-1">Item name</label>
                <input className={inputCls} value={adding.itemName} onChange={(e) => setAdding({ ...adding, itemName: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-ink-soft mb-1">UOM</label>
                <input className={inputCls} value={adding.uom} onChange={(e) => setAdding({ ...adding, uom: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-ink-soft mb-1">Required qty</label>
                <input type="number" min="0" className={inputCls + ' num'} value={adding.requiredQty} onChange={(e) => setAdding({ ...adding, requiredQty: Number(e.target.value) })} />
              </div>
              <div className="col-span-2 md:col-span-4">
                <label className="block text-xs text-ink-soft mb-1">Remark</label>
                <input className={inputCls} value={adding.remark} onChange={(e) => setAdding({ ...adding, remark: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <button className={btn('green')} onClick={addLine} disabled={!adding.itemName || !adding.departmentId}>Add item</button>
                <button className={btn('subtle')} onClick={() => setAdding(null)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}

function LineRow({ line, index, edited, editable, onSave, onRemove }) {
  const [qty, setQty] = useState(line.requiredQty);
  const [remark, setRemark] = useState(line.remark);
  useEffect(() => {
    setQty(line.requiredQty);
    setRemark(line.remark);
  }, [line.requiredQty, line.remark]);

  function blurSave() {
    if (Number(qty) !== line.requiredQty || remark !== line.remark) {
      onSave(line, { requiredQty: Number(qty || 0), remark });
    }
  }

  const qtyChanged = edited && Number(line.requiredQty) !== Number(line.sourceQty || 0);

  return (
    <tr className={line.addedByUnitHead ? 'row-added' : edited ? 'row-edited' : undefined}>
      <td className="w-8 text-ink-faint font-mono text-xs">{index + 1}</td>
      <td className="min-w-44">
        <span className="align-middle">{line.itemName}</span>
        {line.addedByUnitHead ? (
          <span className="ml-1.5 stamp stamp-violet align-middle" title="You added this line at unit level — it was not in the department's DPR">
            added
          </span>
        ) : edited ? (
          <span
            className="ml-1.5 stamp stamp-warn align-middle"
            title={`Department head submitted qty ${line.sourceQty}${line.sourceRemark ? ` · remark "${line.sourceRemark}"` : ''}`}
          >
            edited
          </span>
        ) : null}
      </td>
      <td className="w-16 text-ink-soft">{line.uom}</td>
      <td className="w-24 num text-ink-soft">{line.closingStock ?? '—'}</td>
      <td className="w-24 num text-ink-soft">{line.bufferDays ?? '—'}</td>
      <td className="w-28 num">
        {editable ? (
          <input
            type="number"
            min="0"
            className={inputCls + ' num' + (qtyChanged ? ' border-accent' : '')}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onBlur={blurSave}
            aria-label={`Required quantity for ${line.itemName}`}
          />
        ) : (
          <span className="font-medium">{line.requiredQty}</span>
        )}
        {qtyChanged && (
          <span className="block text-[11px] text-ink-faint mt-0.5">
            was <span className="line-through">{line.sourceQty}</span>
          </span>
        )}
      </td>
      <td className="min-w-36">
        {editable ? (
          <input className={inputCls} value={remark} onChange={(e) => setRemark(e.target.value)} onBlur={blurSave} aria-label={`Remark for ${line.itemName}`} />
        ) : (
          <span className="text-ink-soft">{line.remark}</span>
        )}
      </td>
      {editable && (
        <td className="w-10 text-center">
          <button
            className="p-1 rounded-md text-ink-faint hover:text-danger hover:bg-danger-soft transition-colors"
            title={`Remove ${line.itemName}`}
            onClick={() => onRemove(line)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </td>
      )}
    </tr>
  );
}
