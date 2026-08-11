import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import Layout, { EmptyState, ErrorNote, StatusBadge, btn, inputCls } from '../components/Layout.jsx';
import {
  FilterBar,
  SortTh,
  TableSkeleton,
  daysAgo,
  sortRows,
  today,
  useSort,
} from '../components/Reporting.jsx';

const fmt = (n) => (n ?? 0).toLocaleString();
const when = (d) => (d ? new Date(d).toLocaleString() : '—');

function downloadCsv(filename, columns, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => esc(c.label)).join(',')];
  for (const r of rows) {
    lines.push(columns.map((c) => esc(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(','));
  }
  // BOM so Excel opens the UTF-8 CSV with accents intact
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const TABS = [
  ['compliance', 'DPR compliance'],
  ['register', 'Order register'],
  ['dispatch', 'Dispatch log'],
  ['edits', 'Unit-head changes'],
];

const EDIT_LABEL = {
  'unit-head-edit': ['edited', 'stamp-warn'],
  'unit-head-add': ['added', 'stamp-violet'],
  'unit-head-remove': ['removed', 'stamp-neutral'],
};

// Compliance matrix cell: letter + color, so status never rides on color alone.
function DayCell({ status, date }) {
  const map = {
    submitted: ['S', 'bg-ok-soft text-ok'],
    draft: ['D', 'bg-accent-soft text-accent-deep'],
  };
  const [letter, cls] = map[status] || ['–', 'bg-line-soft text-ink-faint'];
  return (
    <span
      title={`${date}: ${status || 'no DPR'}`}
      className={`inline-grid place-items-center w-5.5 h-5.5 rounded text-[10px] font-semibold ${cls}`}
    >
      {letter}
    </span>
  );
}

// Submission-rate meter: the fill carries state, the track is a lighter step of
// the same hue, and the % figure keeps the value off color alone.
function RateMeter({ pct }) {
  const [fill, track] =
    pct >= 90
      ? ['#059669', 'var(--color-ok-soft)']
      : pct >= 60
        ? ['#d97706', 'var(--color-accent-soft)']
        : ['#dc2626', 'var(--color-danger-soft)'];
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="meter" style={{ background: track }}>
        <span style={{ display: 'block', height: '100%', borderRadius: 9999, width: `${Math.min(pct, 100)}%`, background: fill }} />
      </span>
      <span className="num font-medium w-9 shrink-0">{pct}%</span>
    </span>
  );
}

function CardHead({ children, hint }) {
  return (
    <h2 className="px-4 py-2.5 bg-paper border-b border-line-soft text-sm font-semibold flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      {children}
      {hint && <span className="font-normal text-xs text-ink-faint">{hint}</span>}
    </h2>
  );
}

export default function ReportsHub() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const [params, setParams] = useSearchParams();
  const urlTab = params.get('tab');
  const tab = TABS.some(([k]) => k === urlTab) ? urlTab : 'compliance';
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const [unitId, setUnitId] = useState('');
  const [units, setUnits] = useState([]);
  const [department, setDepartment] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState({}); // tab -> payload
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sort, toggleSort] = useSort();

  useEffect(() => {
    if (isAdmin) api('/admin/units').then((u) => setUnits(u.filter((x) => x.active !== false))).catch(() => {});
  }, [isAdmin]);

  function load(t = tab, f = from, tt = to, u = unitId, dep = department) {
    setBusy(true);
    setError('');
    const qs = new URLSearchParams({ from: f, to: tt });
    if (u) qs.set('unitId', u);
    if (t === 'register' && dep) qs.set('department', dep);
    api(`/analytics/${t}?${qs}`)
      .then((d) => setData((prev) => ({ ...prev, [t]: d })))
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }
  useEffect(() => {
    load(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // The tab lives in the URL, so a refresh or a shared link lands on the same
  // report and browser back/forward walks between tabs.
  function switchTab(k) {
    if (k === tab) return;
    setParams(k === 'compliance' ? {} : { tab: k });
  }

  // Other tabs' caches go stale when filters change — drop them but keep the
  // active tab's payload rendered (dimmed) until its fresh data lands.
  function applyFilters(f = from, t = to, u = unitId) {
    setData((prev) => ({ [tab]: prev[tab] }));
    load(tab, f, t, u, department);
  }

  const d = data[tab];

  const registerRows = useMemo(() => {
    const rows = data.register?.rows || [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.item.toLowerCase().includes(q) ||
        (r.department || '').toLowerCase().includes(q) ||
        (r.category || '').toLowerCase().includes(q)
    );
  }, [data.register, search]);

  const sortedRegister = useMemo(() => sortRows(registerRows, sort), [registerRows, sort]);

  function exportCsv() {
    const stamp = `${from}_to_${to}`;
    if (tab === 'compliance' && data.compliance) {
      const { dates, groups } = data.compliance;
      const rows = groups.flatMap((g) =>
        g.departments.map((dep) => ({ unit: g.unit, ...dep }))
      );
      downloadCsv(`dpr-compliance_${stamp}.csv`, [
        { label: 'Unit', value: 'unit' },
        { label: 'Department', value: 'name' },
        { label: 'Submitted days', value: 'submitted' },
        { label: 'Draft days', value: 'drafts' },
        { label: 'Missing days', value: 'missing' },
        { label: 'Compliance %', value: 'ratePct' },
        ...dates.map((date, i) => ({ label: date, value: (r) => r.statuses[i] || '' })),
      ], rows);
    } else if (tab === 'register' && data.register) {
      downloadCsv(`order-register_${stamp}.csv`, [
        ...(isAdmin && !unitId ? [{ label: 'Unit', value: 'unit' }] : []),
        { label: 'Department', value: 'department' },
        { label: 'Item', value: 'item' },
        { label: 'UOM', value: 'uom' },
        { label: 'Category', value: (r) => r.category || 'Other' },
        { label: 'Times ordered', value: 'times' },
        { label: 'Total qty', value: 'totalQty' },
        { label: 'Avg qty per order', value: 'avgQty' },
        { label: 'Last ordered', value: 'lastOrdered' },
      ], sortedRegister);
    } else if (tab === 'dispatch' && data.dispatch) {
      downloadCsv(`upr-dispatch_${stamp}.csv`, [
        { label: 'Cycle date', value: 'cycleDate' },
        ...(isAdmin && !unitId ? [{ label: 'Unit', value: 'unit' }] : []),
        { label: 'Status', value: 'status' },
        { label: 'Items', value: 'lines' },
        { label: 'Ordered items', value: 'orderedLines' },
        { label: 'Verified by', value: 'verifiedSignName' },
        { label: 'Verified at', value: (r) => (r.verifiedAt ? new Date(r.verifiedAt).toISOString() : '') },
        { label: 'Sent at', value: (r) => (r.sentAt ? new Date(r.sentAt).toISOString() : '') },
        { label: 'Sent to', value: 'sentToEmail' },
      ], data.dispatch.rows);
    } else if (tab === 'edits' && data.edits) {
      downloadCsv(`unit-head-changes_${stamp}.csv`, [
        { label: 'When', value: (r) => new Date(r.timestamp).toISOString() },
        ...(isAdmin && !unitId ? [{ label: 'Unit', value: 'unit' }] : []),
        { label: 'User', value: 'user' },
        { label: 'Action', value: (r) => EDIT_LABEL[r.action]?.[0] || r.action },
        { label: 'Item', value: 'item' },
        { label: 'Qty before', value: 'oldQty' },
        { label: 'Qty after', value: 'newQty' },
        { label: 'Remark before', value: 'oldRemark' },
        { label: 'Remark after', value: 'newRemark' },
      ], data.edits.rows);
    }
  }

  const showMatrix = data.compliance && data.compliance.dates.length <= 31;
  const dispatchSent = data.dispatch ? data.dispatch.rows.filter((r) => r.status === 'sent').length : 0;
  const dispatchVerified = data.dispatch ? data.dispatch.rows.filter((r) => r.status === 'verified').length : 0;

  return (
    <Layout
      title="Reports"
      subtitle="Compliance, order register, dispatch log and change audit — exportable as CSV"
      actions={
        <button className={btn('subtle')} onClick={exportCsv} disabled={!d || busy}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M7 10l5 5 5-5" />
            <path d="M12 15V3" />
          </svg>
          Export CSV
        </button>
      }
    >
      <ErrorNote error={error} />

      <div className="tabs mb-4" role="tablist" aria-label="Report">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className="tab-btn" onClick={() => switchTab(key)}>
            {label}
          </button>
        ))}
      </div>

      <FilterBar
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        busy={busy}
        onRange={(f, t) => {
          setFrom(f);
          setTo(t);
          setData((prev) => ({ [tab]: prev[tab] }));
          load(tab, f, t);
        }}
        onApply={() => applyFilters()}
      >
        {isAdmin && (
          <div>
            <label className="block text-xs text-ink-soft mb-1">Unit</label>
            <select
              className={inputCls}
              value={unitId}
              onChange={(e) => {
                setUnitId(e.target.value);
                setDepartment('');
                setData({});
                load(tab, from, to, e.target.value, '');
              }}
            >
              <option value="">All units</option>
              {units.map((u) => (
                <option key={u._id} value={u._id}>{u.name}</option>
              ))}
            </select>
          </div>
        )}
        {tab === 'register' && (
          <>
            <div>
              <label className="block text-xs text-ink-soft mb-1">Department</label>
              <select
                className={inputCls}
                value={department}
                onChange={(e) => {
                  setDepartment(e.target.value);
                  load(tab, from, to, unitId, e.target.value);
                }}
              >
                <option value="">All departments</option>
                {(data.register?.departments || []).map((dep) => (
                  <option key={dep.id} value={dep.id}>
                    {dep.name}{isAdmin && !unitId && dep.unit ? ` — ${dep.unit}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-44">
              <label className="block text-xs text-ink-soft mb-1">Search</label>
              <div className="relative">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint pointer-events-none" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  className={inputCls + ' pl-8 pr-8'}
                  placeholder="Item, department or category…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-ink-faint hover:text-ink hover:bg-line-soft"
                    onClick={() => setSearch('')}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5" aria-hidden="true">
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </FilterBar>

      {!d && !error && <TableSkeleton rows={8} />}

      <div className={busy ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        {/* ---------------- DPR compliance ---------------- */}
        {tab === 'compliance' && data.compliance && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-ink-soft">
              <span className="inline-flex items-center gap-1.5"><DayCell status="submitted" date="" /> submitted</span>
              <span className="inline-flex items-center gap-1.5"><DayCell status="draft" date="" /> draft, never submitted</span>
              <span className="inline-flex items-center gap-1.5"><DayCell status={null} date="" /> no DPR</span>
              {!showMatrix && <span className="text-ink-faint">day-by-day grid shows for ranges up to 31 days</span>}
            </div>
            {data.compliance.groups.map((g) => {
              const expected = data.compliance.days * g.departments.length;
              const submitted = g.departments.reduce((n, dep) => n + dep.submitted, 0);
              const unitPct = expected ? Math.round((submitted / expected) * 100) : 0;
              return (
                <section key={g.unit} className="card overflow-hidden mb-4">
                  <CardHead hint={`${unitPct}% of expected DPRs submitted`}>{g.unit}</CardHead>
                  <div className="overflow-x-auto">
                    <table className="tbl tbl-dense">
                      <thead>
                        <tr>
                          <th>Department</th>
                          <th className="text-right">Submitted</th>
                          <th className="text-right">Drafts</th>
                          <th className="text-right">Missing</th>
                          <th className="text-right">Rate</th>
                          {showMatrix && <th>{`Days (${data.compliance.from.slice(5)} → ${data.compliance.to.slice(5)})`}</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {g.departments.map((dep) => (
                          <tr key={dep.name}>
                            <td className="font-medium whitespace-nowrap">{dep.name}</td>
                            <td className="num">{dep.submitted} / {data.compliance.days}</td>
                            <td className="num text-ink-soft">{dep.drafts}</td>
                            <td className="num text-ink-soft">{dep.missing}</td>
                            <td className="text-right whitespace-nowrap"><RateMeter pct={dep.ratePct} /></td>
                            {showMatrix && (
                              <td>
                                <div className="flex flex-wrap gap-1">
                                  {dep.statuses.map((st, i) => (
                                    <DayCell key={data.compliance.dates[i]} status={st} date={data.compliance.dates[i]} />
                                  ))}
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
            {!data.compliance.groups.length && (
              <EmptyState
                title="No active departments in this scope"
                hint="Departments appear here once they are set up under the selected unit."
              />
            )}
          </>
        )}

        {/* ---------------- Order register ---------------- */}
        {tab === 'register' && data.register && (
          <section className="card overflow-hidden">
            <CardHead
              hint={
                search.trim()
                  ? `${fmt(registerRows.length)} of ${fmt(data.register.rows.length)} rows match · from verified & sent UPRs`
                  : `${fmt(registerRows.length)} row(s) · from verified & sent UPRs`
              }
            >
              Item order register
            </CardHead>
            <div className="overflow-x-auto">
              <table className="tbl tbl-dense">
                <thead>
                  <tr>
                    {isAdmin && !unitId && <SortTh k="unit" sort={sort} onSort={toggleSort}>Unit</SortTh>}
                    <SortTh k="department" sort={sort} onSort={toggleSort}>Department</SortTh>
                    <SortTh k="item" sort={sort} onSort={toggleSort}>Item</SortTh>
                    <th>UOM</th>
                    <SortTh k="category" sort={sort} onSort={toggleSort}>Category</SortTh>
                    <SortTh k="times" sort={sort} onSort={toggleSort} right>Times</SortTh>
                    <SortTh k="totalQty" sort={sort} onSort={toggleSort} right>Total qty</SortTh>
                    <SortTh k="avgQty" sort={sort} onSort={toggleSort} right>Avg / order</SortTh>
                    <SortTh k="lastOrdered" sort={sort} onSort={toggleSort} right>Last ordered</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {sortedRegister.map((r, i) => (
                    <tr key={i}>
                      {isAdmin && !unitId && <td className="text-ink-soft whitespace-nowrap">{r.unit}</td>}
                      <td className="text-ink-soft whitespace-nowrap">{r.department}</td>
                      <td className="font-medium">{r.item}</td>
                      <td className="text-ink-soft whitespace-nowrap">{r.uom}</td>
                      <td className="text-ink-soft">{r.category || 'Other'}</td>
                      <td className="num">{fmt(r.times)}</td>
                      <td className="num font-medium">{fmt(r.totalQty)}</td>
                      <td className="num text-ink-soft">{fmt(r.avgQty)}</td>
                      <td className="num text-ink-soft">{r.lastOrdered}</td>
                    </tr>
                  ))}
                  {!sortedRegister.length && (
                    <tr>
                      <td colSpan={9} className="text-center text-ink-faint text-xs py-6">
                        Nothing ordered in this range{search ? ' matching the search' : ''}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ---------------- UPR dispatch log ---------------- */}
        {tab === 'dispatch' && data.dispatch && (
          <section className="card overflow-hidden">
            <CardHead
              hint={`${fmt(data.dispatch.rows.length)} UPR(s) · ${fmt(dispatchSent)} sent${dispatchVerified ? ` · ${fmt(dispatchVerified)} verified, unsent` : ''}`}
            >
              UPR dispatch log
            </CardHead>
            <div className="overflow-x-auto">
              <table className="tbl tbl-dense">
                <thead>
                  <tr>
                    <th>Cycle date</th>
                    {isAdmin && !unitId && <th>Unit</th>}
                    <th>Status</th>
                    <th className="text-right">Items</th>
                    <th className="text-right">Ordered items</th>
                    <th>Verified by</th>
                    <th>Sent at</th>
                    <th>Sent to</th>
                  </tr>
                </thead>
                <tbody>
                  {data.dispatch.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="font-medium whitespace-nowrap">{r.cycleDate}</td>
                      {isAdmin && !unitId && <td className="text-ink-soft whitespace-nowrap">{r.unit}</td>}
                      <td><StatusBadge status={r.status} /></td>
                      <td className="num">{fmt(r.lines)}</td>
                      <td className="num">{fmt(r.orderedLines)}</td>
                      <td className="text-ink-soft whitespace-nowrap">
                        {r.verifiedSignName || '—'}
                        {r.verifiedAt && <span className="block text-[11px] text-ink-faint">{when(r.verifiedAt)}</span>}
                      </td>
                      <td className="text-ink-soft whitespace-nowrap">{when(r.sentAt)}</td>
                      <td className="text-ink-soft">{r.sentToEmail || '—'}</td>
                    </tr>
                  ))}
                  {!data.dispatch.rows.length && (
                    <tr><td colSpan={8} className="text-center text-ink-faint text-xs py-6">No UPRs in this range</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ---------------- Unit-head changes ---------------- */}
        {tab === 'edits' && data.edits && (
          <section className="card overflow-hidden">
            <CardHead hint={`${fmt(data.edits.rows.length)} change(s)`}>Unit-head changes to consolidated UPRs</CardHead>
            <div className="overflow-x-auto">
              <table className="tbl tbl-dense">
                <thead>
                  <tr>
                    <th>When</th>
                    {isAdmin && !unitId && <th>Unit</th>}
                    <th>User</th>
                    <th>Action</th>
                    <th>Item</th>
                    <th className="text-right">Qty change</th>
                    <th>Remark change</th>
                  </tr>
                </thead>
                <tbody>
                  {data.edits.rows.map((r, i) => {
                    const [label, cls] = EDIT_LABEL[r.action] || [r.action, 'stamp-neutral'];
                    const qtyChanged = r.oldQty !== undefined || r.newQty !== undefined;
                    return (
                      <tr key={i}>
                        <td className="text-ink-soft whitespace-nowrap">{when(r.timestamp)}</td>
                        {isAdmin && !unitId && <td className="text-ink-soft whitespace-nowrap">{r.unit}</td>}
                        <td className="whitespace-nowrap">{r.user}</td>
                        <td><span className={`stamp ${cls}`}>{label}</span></td>
                        <td className="font-medium">{r.item || '—'}</td>
                        <td className="num whitespace-nowrap">
                          {qtyChanged ? (
                            <>
                              <span className="text-ink-faint">{r.oldQty ?? '—'}</span>
                              <span className="text-ink-faint mx-1" aria-hidden="true">→</span>
                              <span className="font-medium">{r.newQty ?? '—'}</span>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="text-ink-soft text-xs max-w-60 truncate" title={r.newRemark || r.oldRemark || ''}>
                          {r.oldRemark || r.newRemark
                            ? `${r.oldRemark || '—'} → ${r.newRemark || '—'}`
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                  {!data.edits.rows.length && (
                    <tr>
                      <td colSpan={7} className="text-center text-ink-faint text-xs py-6">
                        No unit-head changes in this range — departments' submissions went through untouched
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
}
