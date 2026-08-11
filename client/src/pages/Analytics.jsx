import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import Layout, { EmptyState, ErrorNote, Note, Stat, inputCls } from '../components/Layout.jsx';
import { FilterBar, StatSkeleton, TableSkeleton, daysAgo, today } from '../components/Reporting.jsx';

const SERIES = '#4f46e5'; // brand indigo — validated ≥3:1 on the white card surface

const fmt = (n) => (n ?? 0).toLocaleString();
const fmtQty = (n) => {
  const v = Math.round((n ?? 0) * 100) / 100;
  return v.toLocaleString();
};

const INITIAL_BARS = 6;

// Horizontal magnitude bars: one hue, thin marks, 4px rounded data-end, value
// always visible beside the bar. Long lists collapse to the top few with an
// explicit "show all" so the page stays short.
function BarList({ rows, unit }) {
  const [showAll, setShowAll] = useState(false);
  const top = Math.max(...rows.map((r) => r.value), 1);
  const visible = showAll ? rows : rows.slice(0, INITIAL_BARS);
  return (
    <div className="px-4 py-3 space-y-2.5">
      {visible.map((r) => (
        <div key={r.key} className="group" title={r.title || ''}>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <span className="text-[13px] font-medium truncate">
              {r.label}
              {r.sub && <span className="ml-1.5 text-[11px] font-normal text-ink-faint">{r.sub}</span>}
            </span>
            <span className="text-[13px] num shrink-0">
              {fmt(r.value)}
              {unit ? ` ${unit}` : ''}
              {r.pct != null && <span className="text-ink-faint ml-1.5 text-[11px]">{r.pct}%</span>}
            </span>
          </div>
          <div className="h-2.5 rounded-r bg-line-soft overflow-hidden">
            <div
              className="h-full rounded-r transition-[width] duration-300 group-hover:opacity-80"
              style={{ width: `${Math.max((r.value / top) * 100, r.value > 0 ? 1.5 : 0)}%`, background: SERIES }}
            />
          </div>
        </div>
      ))}
      {!rows.length && <div className="text-center text-ink-faint text-xs py-4">Nothing in this range yet</div>}
      {rows.length > INITIAL_BARS && (
        <button
          type="button"
          className="w-full text-center text-xs font-medium text-brand-deep hover:text-brand py-1"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  );
}

function CardHead({ children, hint }) {
  return (
    <h2 className="px-4 py-2.5 bg-paper border-b border-line-soft text-sm font-semibold">
      {children}
      {hint && <span className="ml-2 font-normal text-xs text-ink-faint">{hint}</span>}
    </h2>
  );
}

// One card, one department at a time — a pill switcher instead of a wall of
// stacked per-department cards.
function DeptItemsCard({ depts }) {
  const [sel, setSel] = useState(0);
  const idx = Math.min(sel, depts.length - 1);
  const d = depts[idx];
  return (
    <section className="card overflow-hidden">
      <CardHead hint="ranked by order frequency in the range">Top items by department</CardHead>
      <div className="px-4 pt-3 pb-2 flex flex-wrap gap-1.5 border-b border-line-soft">
        {depts.map((dep, i) => (
          <button
            key={dep.id + i}
            type="button"
            aria-pressed={i === idx}
            className={`stamp stamp-plain dept-${i % 6} ${i === idx ? 'dept-pill' : 'dept-pill-off'}`}
            onClick={() => setSel(i)}
            title={dep.unitName || ''}
          >
            {dep.name}
            {dep.unitName && <span className="font-normal opacity-70">· {dep.unitName}</span>}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="tbl tbl-dense">
          <thead>
            <tr>
              <th>Item</th>
              <th className="text-right">Times</th>
              <th className="text-right">Total qty</th>
            </tr>
          </thead>
          <tbody>
            {d.items.map((it) => (
              <tr key={`${it.name}|${it.uom}`}>
                <td className="font-medium">{it.name}</td>
                <td className="num">{fmt(it.times)}</td>
                <td className="num text-ink-soft whitespace-nowrap">{fmtQty(it.qty)} {it.uom}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Analytics() {
  const { user } = useAuth();
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const [unitId, setUnitId] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function load(f = from, t = to, u = unitId) {
    setBusy(true);
    setError('');
    api(`/analytics/dashboard?from=${f}&to=${t}${u ? `&unitId=${u}` : ''}`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }
  useEffect(() => load(), []);

  const s = data?.summary;
  const groupView = data && !data.scope.unitId;
  const noOrders = data && s.orderedLines === 0;

  return (
    <Layout
      title="Analytics"
      subtitle={
        user.role === 'unit_head'
          ? 'What your unit orders — figures read from verified & sent UPRs'
          : 'What the group orders — figures read from verified & sent UPRs'
      }
    >
      <ErrorNote error={error} />

      <FilterBar
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        busy={busy}
        onRange={(f, t) => {
          setFrom(f);
          setTo(t);
          load(f, t);
        }}
        onApply={() => load()}
      >
        {data?.unitsList?.length > 0 && (
          <div>
            <label className="block text-xs text-ink-soft mb-1">Unit</label>
            <select
              className={inputCls}
              value={unitId}
              onChange={(e) => {
                setUnitId(e.target.value);
                load(from, to, e.target.value);
              }}
            >
              <option value="">All units</option>
              {data.unitsList.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        )}
      </FilterBar>

      {!data && !error && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
            {Array.from({ length: 6 }, (_, i) => (
              <StatSkeleton key={i} />
            ))}
          </div>
          <div className="grid lg:grid-cols-2 gap-4 items-start">
            <TableSkeleton rows={5} />
            <TableSkeleton rows={5} />
          </div>
        </>
      )}

      {data && (
        <div className={busy ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {noOrders && (
            <Note tone="info">
              No verified or sent UPRs between {data.from} and {data.to} — ordering analytics appear once a UPR is
              verified. DPR submission figures below still count.
            </Note>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
            <Stat label="Active days" value={s.activeDays} sub={`of ${data.days} in range`} />
            <Stat label="DPRs submitted" value={fmt(s.dprsSubmitted)} sub={`${s.dprCompliancePct}% compliance`} />
            <Stat label="UPRs sent" value={fmt(s.uprsSent)} sub={s.uprsVerified ? `+ ${s.uprsVerified} verified, unsent` : ''} />
            <Stat label="Items ordered" value={fmt(s.orderedLines)} sub={`${fmt(s.distinctItems)} unique items`} />
            <Stat label="Off-list additions" value={fmt(s.offListLines)} sub="manually added DPR lines" />
            <Stat
              label="Unit-head changes"
              value={fmt(s.unitHeadChanges.edited + s.unitHeadChanges.added + s.unitHeadChanges.removed)}
              sub={`${s.unitHeadChanges.edited} edits · ${s.unitHeadChanges.added} added · ${s.unitHeadChanges.removed} removed`}
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-4 items-start mb-4">
            <section className="card overflow-hidden">
              <CardHead hint="by items ordered, share of total">Top departments</CardHead>
              <BarList
                rows={data.topDepartments.map((d, i) => ({
                  key: d.id + i,
                  label: d.name,
                  sub: d.unitName,
                  value: d.lines,
                  pct: d.sharePct,
                  title: `${d.items} distinct items · DPR submitted on ${d.submittedDays} day(s)`,
                }))}
              />
            </section>

            <section className="card overflow-hidden">
              <CardHead hint="items ordered, share of total">Category mix</CardHead>
              <BarList
                rows={data.categories.map((c) => ({
                  key: c.name,
                  label: c.name,
                  value: c.lines,
                  pct: c.sharePct,
                  title: `${c.items} distinct items`,
                }))}
              />
            </section>
          </div>

          <div className="grid lg:grid-cols-2 gap-4 items-start mb-4">
            <section className="card overflow-hidden">
              <CardHead hint="most frequently ordered in range">Top items overall</CardHead>
              <div className="overflow-x-auto">
              <table className="tbl tbl-dense">
                <thead>
                  <tr>
                    <th className="w-8">#</th>
                    <th>Item</th>
                    <th>Category</th>
                    <th className="text-right">Times</th>
                    <th className="text-right">Total qty</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topItems.map((it, i) => (
                    <tr key={`${it.name}|${it.uom}`}>
                      <td className="text-ink-faint text-xs num text-left">{i + 1}</td>
                      <td className="font-medium">{it.name}</td>
                      <td className="text-ink-soft">{it.category || 'Other'}</td>
                      <td className="num">{fmt(it.times)}</td>
                      <td className="num whitespace-nowrap">{fmtQty(it.qty)} {it.uom}</td>
                    </tr>
                  ))}
                  {!data.topItems.length && (
                    <tr><td colSpan={5} className="text-center text-ink-faint text-xs py-5">Nothing ordered in this range yet</td></tr>
                  )}
                </tbody>
              </table>
              </div>
            </section>

            {data.itemsByDepartment.length > 0 ? (
              <DeptItemsCard depts={data.itemsByDepartment} />
            ) : (
              <EmptyState
                title="Nothing ordered in this range"
                hint="Department breakdowns appear once a UPR is verified or sent within the selected dates."
              />
            )}
          </div>

          {groupView && data.units.length > 0 && (
            <section className="card overflow-hidden">
              <CardHead hint="activity in the selected range">Unit comparison</CardHead>
              <div className="overflow-x-auto">
              <table className="tbl tbl-dense">
                <thead>
                  <tr>
                    <th>Unit</th>
                    <th className="text-right">Departments</th>
                    <th className="text-right">DPRs submitted</th>
                    <th className="text-right">UPRs sent</th>
                    <th className="text-right">Items ordered</th>
                    <th className="w-1/4"></th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.units]
                    .sort((a, b) => b.lines - a.lines)
                    .map((u) => {
                      const max = Math.max(...data.units.map((x) => x.lines), 1);
                      return (
                        <tr key={u.id}>
                          <td className="font-medium">
                            {u.name}
                            {u.city && <span className="ml-1.5 text-xs font-normal text-ink-faint">{u.city}</span>}
                          </td>
                          <td className="num">{fmt(u.departments)}</td>
                          <td className="num">{fmt(u.dprsSubmitted)}</td>
                          <td className="num">{fmt(u.uprsSent)}</td>
                          <td className="num font-medium">{fmt(u.lines)}</td>
                          <td>
                            <div className="h-2.5 rounded-r bg-line-soft overflow-hidden min-w-20">
                              <div
                                className="h-full rounded-r"
                                style={{ width: `${Math.max((u.lines / max) * 100, u.lines > 0 ? 1.5 : 0)}%`, background: SERIES }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              </div>
            </section>
          )}
        </div>
      )}
    </Layout>
  );
}
