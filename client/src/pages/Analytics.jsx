import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import Layout, { EmptyState, ErrorNote, Note, Stat, inputCls } from '../components/Layout.jsx';
import { ChartSkeleton, FilterBar, StatSkeleton, TableSkeleton, daysAgo, today } from '../components/Reporting.jsx';

const SERIES = '#4f46e5'; // brand indigo — validated ≥3:1 on the white card surface

const fmt = (n) => (n ?? 0).toLocaleString();
const fmtQty = (n) => {
  const v = Math.round((n ?? 0) * 100) / 100;
  return v.toLocaleString();
};

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => setW(entries[0].contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// Clean y-axis ticks: 0 → a rounded max in 1/2/5×10^k steps.
function niceTicks(max) {
  if (max <= 0) return [0, 1, 2, 3, 4];
  const rough = max / 4;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= rough) || 10 * mag;
  const out = [];
  for (let v = 0; v <= max || out.length < 2; v += step) out.push(v);
  return out;
}

// Single-series daily trend: 2px line + 10% area wash, hairline grid, crosshair
// tooltip, endpoint dot + direct label. Arrow keys move the reading when focused.
function TrendChart({ points, label }) {
  const [wrapRef, width] = useWidth();
  const [hover, setHover] = useState(null); // index into points
  const H = 210;
  const PAD = { top: 16, right: 52, bottom: 26, left: 40 };
  const w = Math.max(width, 320);
  const innerW = w - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max = Math.max(...points.map((p) => p.lines), 0);
  const ticks = niceTicks(max);
  const yMax = ticks[ticks.length - 1] || 1;
  const x = (i) => PAD.left + (points.length < 2 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v) => PAD.top + innerH - (v / yMax) * innerH;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.lines).toFixed(1)}`).join('');
  const area = points.length
    ? `${path}L${x(points.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`
    : '';
  const xLabelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerW / 84))));
  const last = points.length - 1;

  function moveTo(clientX, el) {
    const rect = el.getBoundingClientRect();
    const px = clientX - rect.left;
    const i = Math.round(((px - PAD.left) / Math.max(innerW, 1)) * (points.length - 1));
    setHover(Math.min(Math.max(i, 0), last));
  }
  function onKey(e) {
    if (e.key === 'ArrowRight') setHover((h) => Math.min((h ?? last) + 1, last));
    else if (e.key === 'ArrowLeft') setHover((h) => Math.max((h ?? last) - 1, 0));
    else if (e.key === 'Escape') setHover(null);
    else return;
    e.preventDefault();
  }

  const hp = hover != null ? points[hover] : null;
  return (
    <div ref={wrapRef} className="relative">
      {width > 0 && points.length > 0 && (
        <svg
          width={w}
          height={H}
          role="img"
          aria-label={label}
          tabIndex={0}
          className="block outline-none focus-visible:ring-2 focus-visible:ring-brand/30 rounded"
          onPointerMove={(e) => moveTo(e.clientX, e.currentTarget)}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={w - PAD.right} y1={y(t)} y2={y(t)} stroke="#f1f5f9" strokeWidth="1" />
              <text x={PAD.left - 8} y={y(t) + 3.5} textAnchor="end" fontSize="11" fill="#94a3b8">
                {fmt(t)}
              </text>
            </g>
          ))}
          <line x1={PAD.left} x2={w - PAD.right} y1={y(0)} y2={y(0)} stroke="#e2e8f0" strokeWidth="1" />
          {points.map((p, i) =>
            i % xLabelEvery === 0 ? (
              <text key={p.date} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#94a3b8">
                {p.date.slice(5)}
              </text>
            ) : null
          )}
          <path d={area} fill={SERIES} opacity="0.1" />
          <path d={path} fill="none" stroke={SERIES} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {hover != null && (
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="#cbd5e1" strokeWidth="1" />
          )}
          {hover != null && <circle cx={x(hover)} cy={y(hp.lines)} r="4.5" fill={SERIES} stroke="#ffffff" strokeWidth="2" />}
          <circle cx={x(last)} cy={y(points[last].lines)} r="4" fill={SERIES} stroke="#ffffff" strokeWidth="2" />
          <text
            x={x(last) + 8}
            y={y(points[last].lines) + 4}
            fontSize="12"
            fontWeight="600"
            fill="#0f172a"
          >
            {fmt(points[last].lines)}
          </text>
        </svg>
      )}
      {hp && (
        <div
          className="pointer-events-none absolute top-1 z-10 rounded-lg border border-line bg-surface px-2.5 py-1.5 shadow-sm text-xs"
          style={{ left: Math.min(Math.max(x(hover) + 10, 0), w - 130) }}
        >
          <div className="font-semibold text-sm num text-left">{fmt(hp.lines)} lines</div>
          <div className="text-ink-faint">{hp.date}</div>
        </div>
      )}
    </div>
  );
}

// Horizontal magnitude bars: one hue, thin marks, 4px rounded data-end, value
// always visible beside the bar (nothing gated behind hover).
function BarList({ rows, max, unit }) {
  const top = max || Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="px-4 py-3 space-y-2.5">
      {rows.map((r) => (
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

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Avg ordered lines by weekday — small columns, value on the cap.
function WeekdayCols({ trend }) {
  const byDow = DOW.map(() => ({ sum: 0, n: 0 }));
  for (const p of trend) {
    const dow = new Date(p.date + 'T00:00:00Z').getUTCDay();
    byDow[dow].sum += p.lines;
    byDow[dow].n += 1;
  }
  const cols = byDow.map((d, i) => ({ dow: DOW[i], avg: d.n ? Math.round(d.sum / d.n) : 0 }));
  const ordered = [...cols.slice(1), cols[0]]; // Mon-first
  const max = Math.max(...ordered.map((c) => c.avg), 1);
  return (
    <div className="flex items-end justify-between gap-2 px-5 pt-6 pb-3 h-44">
      {ordered.map((c) => (
        <div key={c.dow} className="flex-1 flex flex-col items-center justify-end h-full" title={`${c.dow}: avg ${fmt(c.avg)} lines/day`}>
          <span className="text-[11px] num text-center mb-1">{fmt(c.avg)}</span>
          <div
            className="w-full max-w-6 rounded-t bg-brand transition-opacity hover:opacity-80"
            style={{ height: `${Math.max((c.avg / max) * 100, c.avg > 0 ? 2 : 0)}%`, background: SERIES }}
          />
          <span className="text-[11px] text-ink-faint mt-1.5">{c.dow}</span>
        </div>
      ))}
    </div>
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
  const avgPerDay = data && data.days ? Math.round(s.orderedLines / data.days) : 0;

  return (
    <Layout
      title="Analytics"
      subtitle={
        user.role === 'unit_head'
          ? 'Ordering patterns for your unit — figures read from verified & sent UPRs'
          : 'Ordering patterns across the group — figures read from verified & sent UPRs'
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
          <div className="mb-4">
            <ChartSkeleton />
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
            <Stat label="Lines ordered" value={fmt(s.orderedLines)} sub={`${fmt(s.distinctItems)} distinct items`} />
            <Stat label="Off-list additions" value={fmt(s.offListLines)} sub="manually added DPR lines" />
            <Stat
              label="Unit-head changes"
              value={fmt(s.unitHeadChanges.edited + s.unitHeadChanges.added + s.unitHeadChanges.removed)}
              sub={`${s.unitHeadChanges.edited} edits · ${s.unitHeadChanges.added} added · ${s.unitHeadChanges.removed} removed`}
            />
          </div>

          <section className="card overflow-hidden mb-4">
            <CardHead hint={`ordered lines per day${avgPerDay ? ` · avg ${fmt(avgPerDay)}/day` : ''}`}>
              Daily ordering trend
            </CardHead>
            <div className="px-4 py-4">
              <TrendChart points={data.trend} label="Ordered UPR lines per day" />
            </div>
          </section>

          <div className="grid lg:grid-cols-2 gap-4 items-start mb-4">
            <section className="card overflow-hidden">
              <CardHead hint="by ordered lines, share of total">Top departments</CardHead>
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
              <CardHead hint="ordered lines, share of total">Category mix</CardHead>
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

          <section className="mb-4">
            <h2 className="text-base font-semibold mb-3">
              Top items by department
              <span className="ml-2 font-normal text-xs text-ink-faint">ranked by order frequency in the range</span>
            </h2>
            {data.itemsByDepartment.length === 0 ? (
              <EmptyState
                title="Nothing ordered in this range"
                hint="Department breakdowns appear once a UPR is verified or sent within the selected dates."
              />
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                {data.itemsByDepartment.map((d, i) => (
                  <section key={d.id + i} className={`card overflow-hidden dept-${i % 6} dept-edge`}>
                    <div className="dept-head border-b border-line px-4 py-2.5 flex items-center gap-2">
                      <span className="stamp dept-pill">{d.name}</span>
                      {d.unitName && <span className="text-xs text-ink-faint truncate">{d.unitName}</span>}
                    </div>
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
                  </section>
                ))}
              </div>
            )}
          </section>

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

            <section className="card overflow-hidden">
              <CardHead hint="average ordered lines per weekday">Weekday pattern</CardHead>
              <WeekdayCols trend={data.trend} />
            </section>
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
                    <th className="text-right">Lines ordered</th>
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
