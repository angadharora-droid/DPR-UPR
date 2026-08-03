import { Fragment, useEffect, useState } from 'react';
import { api } from '../api.js';
import Layout, { ErrorNote, Note, Stat, btn, inputCls } from '../components/Layout.jsx';

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const today = () => new Date().toISOString().slice(0, 10);

export default function UnitReports() {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [openItem, setOpenItem] = useState(null); // item name whose history is expanded
  const [history, setHistory] = useState({}); // name -> points

  function load(f = from, t = to) {
    setBusy(true);
    setError('');
    api(`/reports/unit?from=${f}&to=${t}`)
      .then((d) => {
        setData(d);
        setOpenItem(null);
        setHistory({});
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }
  useEffect(() => load(), []);

  function preset(n) {
    const f = daysAgo(n - 1);
    const t = today();
    setFrom(f);
    setTo(t);
    load(f, t);
  }

  function toggleHistory(name) {
    if (openItem === name) return setOpenItem(null);
    setOpenItem(name);
    if (!history[name]) {
      api(`/reports/item-history?name=${encodeURIComponent(name)}&from=${from}&to=${to}`)
        .then((r) => setHistory((h) => ({ ...h, [name]: r.points })))
        .catch((e) => setError(e.message));
    }
  }

  const s = data?.summary;
  const noOrders = data && s.uprsVerified + s.uprsSent === 0;

  return (
    <Layout title="Reports" subtitle="What the unit requested and ordered — figures read from verified & sent UPRs">
      <ErrorNote error={error} />

      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-ink-soft mb-1">From</label>
          <input className={inputCls} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-ink-soft mb-1">To</label>
          <input className={inputCls} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button className={btn('green')} onClick={() => load()} disabled={busy}>
          {busy ? 'Loading…' : 'Apply'}
        </button>
        <div className="flex gap-1.5 ml-auto">
          {[7, 30, 90].map((n) => (
            <button key={n} className={btn('subtle') + ' px-2.5 py-1.5 text-xs'} onClick={() => preset(n)} disabled={busy}>
              Last {n} days
            </button>
          ))}
        </div>
      </div>

      {data && (
        <>
          {noOrders && (
            <Note tone="info">
              No verified or sent UPRs between {data.from} and {data.to} — item and category figures appear once a UPR
              is verified. DPR submission activity below still counts drafts-turned-submitted.
            </Note>
          )}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            <Stat label="Active days" value={s.activeCycleDays} sub={`of ${data.days} in range`} />
            <Stat label="DPRs submitted" value={s.dprsSubmitted} />
            <Stat label="UPRs sent" value={s.uprsSent} sub={s.uprsVerified ? `+ ${s.uprsVerified} verified, unsent` : ''} />
            <Stat label="Items ordered" value={s.itemsOrdered.toLocaleString()} sub="UPR line items" />
            <Stat
              label="Unit-head changes"
              value={s.unitHeadEdits.edited + s.unitHeadEdits.added + s.unitHeadEdits.removed}
              sub={`${s.unitHeadEdits.edited} edits · ${s.unitHeadEdits.added} added · ${s.unitHeadEdits.removed} removed`}
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-4 items-start">
            <section className="card overflow-hidden">
              <h2 className="px-4 py-2.5 bg-paper border-b border-line-soft text-sm font-semibold">
                Department activity
              </h2>
              <table className="tbl tbl-dense">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th className="text-right">Days submitted</th>
                    <th className="text-right">Rate</th>
                    <th className="text-right">Lines</th>
                    <th className="text-right">Last submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {data.departments.map((d) => (
                    <tr key={d.name}>
                      <td className="font-medium">{d.name}</td>
                      <td className="num">{d.submittedDays} / {data.days}</td>
                      <td className="num">{Math.round((d.submittedDays / data.days) * 100)}%</td>
                      <td className="num text-ink-soft">{d.lines.toLocaleString()}</td>
                      <td className="num text-ink-soft">{d.lastSubmitted || '—'}</td>
                    </tr>
                  ))}
                  {!data.departments.length && (
                    <tr><td colSpan={5} className="text-center text-ink-faint text-xs py-5">No departments</td></tr>
                  )}
                </tbody>
              </table>
            </section>

            <section className="card overflow-hidden">
              <h2 className="px-4 py-2.5 bg-paper border-b border-line-soft text-sm font-semibold">
                Category breakdown <span className="font-normal text-xs text-ink-faint">(ordered lines)</span>
              </h2>
              <table className="tbl tbl-dense">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="text-right">Line items</th>
                    <th className="text-right">Distinct items</th>
                  </tr>
                </thead>
                <tbody>
                  {data.categories.map((c) => (
                    <tr key={c.name}>
                      <td className="font-medium">{c.name}</td>
                      <td className="num">{c.lines.toLocaleString()}</td>
                      <td className="num text-ink-soft">{c.items.toLocaleString()}</td>
                    </tr>
                  ))}
                  {!data.categories.length && (
                    <tr><td colSpan={3} className="text-center text-ink-faint text-xs py-5">Nothing ordered in this range yet</td></tr>
                  )}
                </tbody>
              </table>
            </section>
          </div>

          <section className="card overflow-hidden mt-4">
            <h2 className="px-4 py-2.5 bg-paper border-b border-line-soft text-sm font-semibold">
              Top ordered items <span className="font-normal text-xs text-ink-faint">(click a row for its day-by-day history)</span>
            </h2>
            <table className="tbl tbl-dense">
              <thead>
                <tr>
                  <th className="w-8">#</th>
                  <th>Item</th>
                  <th className="w-28">UOM</th>
                  <th>Category</th>
                  <th className="text-right">Times ordered</th>
                  <th className="text-right">Total qty</th>
                </tr>
              </thead>
              <tbody>
                {data.topItems.map((it, i) => (
                  <Fragment key={`${it.name}|${it.uom}`}>
                    <tr
                      className="cursor-pointer hover:bg-line-soft transition-colors"
                      onClick={() => toggleHistory(it.name)}
                    >
                      <td className="text-ink-faint text-xs num text-left">{i + 1}</td>
                      <td className="font-medium">{it.name}</td>
                      <td className="text-ink-soft whitespace-nowrap" title={it.uom}>{it.uom}</td>
                      <td className="text-ink-soft">{it.category || 'Other'}</td>
                      <td className="num">{it.timesOrdered}</td>
                      <td className="num font-medium">{it.totalQty.toLocaleString()}</td>
                    </tr>
                    {openItem === it.name && (
                      <tr>
                        <td colSpan={6} className="bg-paper px-6 py-3">
                          {!history[it.name] ? (
                            <span className="text-xs text-ink-faint">Loading history…</span>
                          ) : history[it.name].length === 0 ? (
                            <span className="text-xs text-ink-faint">No orders in this range.</span>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {history[it.name].map((p) => (
                                <span
                                  key={p.cycleDate}
                                  className="stamp stamp-neutral"
                                  title={p.departments?.join(', ')}
                                >
                                  {p.cycleDate}: <b className="ml-1">{p.qty} {p.uom}</b>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {!data.topItems.length && (
                  <tr><td colSpan={6} className="text-center text-ink-faint text-xs py-5">Nothing ordered in this range yet</td></tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </Layout>
  );
}
