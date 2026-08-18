import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, downloadPdf } from '../api.js';
import Layout, { StatusBadge, ErrorNote, btn } from '../components/Layout.jsx';

// Read-only view of any UPR by id — used by Admin from the cross-unit overview
// (unit heads and the purchase head can open their own too; the API scopes access).
export default function UprView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [upr, setUpr] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/upr/${id}`).then(setUpr).catch((e) => setError(e.message));
  }, [id]);

  const num = (v) => Number(v || 0);
  const txt = (v) => String(v || '').trim();
  const isEdited = (l) =>
    l.sourceQty !== null && l.sourceQty !== undefined && (num(l.requiredQty) !== num(l.sourceQty) || txt(l.remark) !== txt(l.sourceRemark));

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
        colorIdx: i % 6,
        count: all.length,
        edited: all.filter(isEdited).length,
        added: all.filter((l) => l.addedByUnitHead).length,
        cats: [...byCat.entries()].map(([cat, lines]) => ({ cat, lines })),
      };
    });
  }, [upr]);

  if (!upr) {
    return (
      <Layout title="UPR">
        <ErrorNote error={error} />
        {!error && <div className="text-ink-faint">Loading…</div>}
      </Layout>
    );
  }

  return (
    <Layout
      title={`UPR — ${upr.unit?.name || ''}`}
      subtitle={`${upr.cycleDate} · ${upr.lines.length} line(s) across ${grouped.length} department(s)`}
      actions={
        <>
          <StatusBadge status={upr.status} lg />
          {upr.status !== 'draft' && (
            <button
              className={btn('primary')}
              onClick={() => downloadPdf(upr._id, `UPR-${upr.unit?.name}-${upr.cycleDate}.pdf`).catch((e) => setError(e.message))}
            >
              Download PDF
            </button>
          )}
          <button className={btn('subtle')} onClick={() => navigate(-1)}>Back</button>
        </>
      }
    >
      <ErrorNote error={error} />

      <div className="card p-4 mb-6">
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-sm">
          <div><dt className="text-xs text-ink-faint">Unit</dt><dd className="font-medium">{upr.unit?.name}{upr.unit?.city ? `, ${upr.unit.city}` : ''}</dd></div>
          <div><dt className="text-xs text-ink-faint">Requisition date</dt><dd className="font-mono text-[13px]">{upr.cycleDate}</dd></div>
          <div>
            <dt className="text-xs text-ink-faint">Verified by</dt>
            <dd>{upr.verifiedSignName || '—'}{upr.verifiedAt && <span className="text-ink-faint"> · {new Date(upr.verifiedAt).toLocaleString()}</span>}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">Sent</dt>
            <dd>
              {upr.status === 'sent'
                ? <>{upr.sentToEmail}{upr.sentAt && <span className="text-ink-faint"> · {new Date(upr.sentAt).toLocaleString()}</span>}</>
                : '—'}
            </dd>
          </div>
        </dl>
      </div>

      {grouped.map(({ dept, cats, count, edited, added, colorIdx }) => (
        <section key={dept} className={`card mb-6 overflow-hidden dept-${colorIdx} dept-edge`}>
          <div className="dept-head border-b border-line px-4 py-2.5 flex flex-wrap items-center gap-2">
            <span className="stamp dept-pill">{dept}</span>
            <span className="text-xs text-ink-faint">{count} line(s)</span>
            {edited > 0 && (
              <span className="stamp stamp-warn" title="Lines whose qty or remark the unit head changed from what this department submitted">
                {edited} edited
              </span>
            )}
            {added > 0 && (
              <span className="stamp stamp-violet" title="Lines the unit head added at unit level">
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
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => {
                      const edited = isEdited(l);
                      const qtyChanged = edited && num(l.requiredQty) !== num(l.sourceQty);
                      return (
                        <tr key={l._id} className={l.addedByUnitHead ? 'row-added' : edited ? 'row-edited' : undefined}>
                          <td className="w-8 text-ink-faint font-mono text-xs">{i + 1}</td>
                          <td className="min-w-44">
                            <span className="align-middle">{l.itemName}</span>
                            {l.addedByUnitHead ? (
                              <span className="ml-1.5 stamp stamp-violet align-middle" title="Added by the unit head — not in the department's DPR">
                                added
                              </span>
                            ) : edited ? (
                              <span
                                className="ml-1.5 stamp stamp-warn align-middle"
                                title={`Department head submitted qty ${l.sourceQty}${l.sourceRemark ? ` · remark "${l.sourceRemark}"` : ''}`}
                              >
                                edited
                              </span>
                            ) : null}
                          </td>
                          <td className="w-16 text-ink-soft">{l.uom}</td>
                          <td className="w-24 num text-ink-soft">{l.closingStock ?? '—'}</td>
                          <td className="w-24 num text-ink-soft">{l.bufferDays ?? '—'}</td>
                          <td className="w-28 num">
                            <span className="font-medium">{l.requiredQty}</span>
                            {qtyChanged && (
                              <span className="block text-[11px] text-ink-faint mt-0.5">
                                was <span className="line-through">{l.sourceQty}</span>
                              </span>
                            )}
                          </td>
                          <td className="min-w-36 text-ink-soft">{l.remark}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      ))}
    </Layout>
  );
}
