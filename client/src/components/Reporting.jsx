import { useState } from 'react';
import { btn, inputCls } from './Layout.jsx';

// Shared pieces for the Analytics and Reports screens: the filter row, loading
// skeletons and sortable table headers.

export function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
export const today = () => new Date().toISOString().slice(0, 10);

export function Spinner({ className = 'w-3.5 h-3.5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`animate-spin ${className}`}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12A10 10 0 0 0 12 2" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

const PRESETS = [7, 30, 90];

// One filter row above everything it scopes: quick ranges first, then the
// custom dates, then page-specific dimension filters (children), then Apply.
// Apply turns solid when the typed dates differ from what is on screen, so a
// pending change is never silent.
export function FilterBar({ from, to, onFromChange, onToChange, onRange, onApply, busy, children }) {
  const [applied, setApplied] = useState({ from, to });
  const dirty = from !== applied.from || to !== applied.to;
  const active = PRESETS.find((n) => from === daysAgo(n - 1) && to === today());

  function pick(n) {
    const f = daysAgo(n - 1);
    const t = today();
    setApplied({ from: f, to: t });
    onRange(f, t);
  }
  function apply() {
    setApplied({ from, to });
    onApply();
  }

  return (
    <div className="card p-4 mb-4 flex flex-wrap items-end gap-3">
      <div>
        <span className="block text-xs text-ink-soft mb-1">Quick range</span>
        <div className="seg" role="group" aria-label="Quick date ranges">
          {PRESETS.map((n) => (
            <button key={n} type="button" className="seg-btn" aria-pressed={active === n} disabled={busy} onClick={() => pick(n)}>
              {n} days
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs text-ink-soft mb-1">From</label>
        <input className={inputCls} type="date" value={from} max={to || undefined} onChange={(e) => onFromChange(e.target.value)} />
      </div>
      <div>
        <label className="block text-xs text-ink-soft mb-1">To</label>
        <input className={inputCls} type="date" value={to} min={from || undefined} onChange={(e) => onToChange(e.target.value)} />
      </div>
      {children}
      <button className={btn(dirty ? 'green' : 'subtle')} onClick={apply} disabled={busy || !from || !to}>
        {busy && <Spinner />}
        {busy ? 'Loading…' : dirty ? 'Apply range' : 'Refresh'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// First-load skeletons. Refetches keep the previous render dimmed instead —
// these only stand in while there is nothing to show yet.
// ---------------------------------------------------------------------------

export function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

export function StatSkeleton() {
  return (
    <div className="card px-5 py-4">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-7 w-14 mt-2" />
      <Skeleton className="h-3 w-24 mt-2" />
    </div>
  );
}

const ROW_WIDTHS = ['w-2/5', 'w-1/4', 'w-3/5', 'w-1/3', 'w-1/2', 'w-2/5', 'w-1/4', 'w-3/5'];

export function TableSkeleton({ rows = 7 }) {
  return (
    <div className="card overflow-hidden" role="status" aria-label="Loading">
      <div className="px-4 py-3 bg-paper border-b border-line-soft">
        <Skeleton className="h-4 w-44" />
      </div>
      <div className="px-4 py-4 space-y-3.5">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className={`h-3.5 ${ROW_WIDTHS[i % ROW_WIDTHS.length]}`} />
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-3.5 w-14" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartSkeleton({ h = 'h-52' }) {
  return (
    <div className="card overflow-hidden" role="status" aria-label="Loading">
      <div className="px-4 py-3 bg-paper border-b border-line-soft">
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="p-4">
        <Skeleton className={`${h} w-full`} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Client-side column sorting for report tables.
// ---------------------------------------------------------------------------

export function useSort() {
  const [sort, setSort] = useState({ key: null, dir: 1 });
  const toggle = (key) => setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: 1 }));
  const reset = () => setSort({ key: null, dir: 1 });
  return [sort, toggle, reset];
}

export function sortRows(rows, sort) {
  if (!sort.key) return rows;
  const { key, dir } = sort;
  return [...rows].sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    if (va == null && vb == null) return 0;
    if (va == null) return 1; // empties last, whichever direction
    if (vb == null) return -1;
    const cmp =
      typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return cmp * dir;
  });
}

export function SortTh({ children, k, sort, onSort, right = false }) {
  const active = sort.key === k;
  return (
    <th aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
      <button type="button" className={`sort-btn ${right ? 'justify-end' : ''}`} onClick={() => onSort(k)}>
        {children}
        <span className="sort-arrow" aria-hidden="true">
          {active ? (sort.dir === 1 ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  );
}
