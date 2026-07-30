import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import Layout, { StatusBadge, ErrorNote, Note, btn, inputCls } from '../components/Layout.jsx';

function mapLines(dprLines) {
  return dprLines.map((l) => ({
    ...l,
    category: l.category?._id || l.category || null,
    categoryName: l.category?.name || 'Other',
  }));
}

export default function DprEntry() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [dpr, setDpr] = useState(null);
  const [categories, setCategories] = useState([]);
  const [lines, setLines] = useState([]);
  const [collapsed, setCollapsed] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const editable = user.role === 'dept_head' && dpr?.status === 'draft';

  useEffect(() => {
    api(`/dpr/${id}`)
      .then((d) => {
        setDpr(d);
        setLines(mapLines(d.lines));
        return api(`/master/categories?departmentId=${d.department._id}`);
      })
      .then(setCategories)
      .catch((e) => setError(e.message));
  }, [id]);

  async function importPosFile(file) {
    if (!file) return;
    if (dirty && !window.confirm('Importing replaces all POS-fed rows (manually added items are kept). Unsaved edits to POS rows will be lost. Continue?')) {
      fileRef.current.value = '';
      return;
    }
    setBusy(true);
    setError('');
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api(`/dpr/${id}/import`, { method: 'POST', formData: fd });
      setDpr(r.dpr);
      setLines(mapLines(r.dpr.lines));
      setDirty(false);
      setImportResult(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const grouped = useMemo(() => {
    const catList = [...categories.map((c) => ({ id: String(c._id), name: c.name })), { id: 'other', name: 'Other' }];
    return catList
      .map((cat) => ({
        ...cat,
        lines: lines
          .map((l, idx) => ({ ...l, idx }))
          .filter((l) => (cat.id === 'other' ? !l.category : String(l.category) === cat.id)),
      }))
      .filter((cat) => cat.lines.length > 0 || (editable && cat.id !== 'other') || (editable && cat.id === 'other'));
  }, [categories, lines, editable]);

  function updateLine(idx, field, value) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
    setDirty(true);
  }

  function removeLine(idx) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  }

  function addLine(categoryId) {
    setLines((prev) => [
      ...prev,
      {
        category: categoryId === 'other' ? null : categoryId,
        item: null,
        itemNameOverride: '',
        uom: '',
        closingStock: null,
        bufferDays: null,
        minMaxSuggestedQty: null,
        requiredQty: 0,
        remark: '',
        isManuallyAdded: true,
      },
    ]);
    setDirty(true);
  }

  function linesPayload() {
    return lines.map((l) => ({
      category: l.category,
      item: l.item?._id || l.item || null,
      itemNameOverride: l.itemNameOverride,
      uom: l.uom,
      closingStock: l.closingStock,
      bufferDays: l.bufferDays,
      minMaxSuggestedQty: l.minMaxSuggestedQty,
      requiredQty: l.requiredQty,
      remark: l.remark,
      isManuallyAdded: l.isManuallyAdded,
    }));
  }

  async function saveDraft() {
    setBusy(true);
    setError('');
    try {
      const d = await api(`/dpr/${id}`, { method: 'PUT', body: { lines: linesPayload() } });
      setLines(d.lines.map((l) => ({ ...l, category: l.category?._id || l.category || null })));
      setDirty(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!window.confirm(`Submit DPR and sign as "${user.name}"?\n\nItems with Required Qty 0 and no remark will be dropped. After submitting you cannot edit unless the Unit Head sends it back.`))
      return;
    setBusy(true);
    setError('');
    try {
      await api(`/dpr/${id}`, { method: 'PUT', body: { lines: linesPayload() } });
      await api(`/dpr/${id}/submit`, { method: 'POST' });
      navigate('/dept');
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  if (!dpr) {
    return (
      <Layout title="DPR">
        <ErrorNote error={error} />
        <div className="text-ink-faint">Loading…</div>
      </Layout>
    );
  }

  const showMinMax = dpr.department?.hasMinMax;
  const itemCount = lines.filter((l) => Number(l.requiredQty) > 0 || (l.remark || '').trim()).length;

  return (
    <Layout
      title={`DPR · ${dpr.department?.name}`}
      subtitle={`${dpr.cycleDate} · ${itemCount} item(s) will be submitted`}
      actions={
        editable ? (
          <>
            {showMinMax && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => importPosFile(e.target.files[0])}
                />
                <button className={btn('subtle')} onClick={() => fileRef.current?.click()} disabled={busy}>
                  {busy ? 'Working…' : 'Import POS file'}
                </button>
              </>
            )}
            <button className={btn('subtle')} onClick={saveDraft} disabled={busy || !dirty}>
              {dirty ? 'Save draft' : 'Saved'}
            </button>
            <button className={btn('green')} onClick={submit} disabled={busy}>
              Sign &amp; submit
            </button>
          </>
        ) : (
          <StatusBadge status={dpr.status} lg />
        )
      }
    >
      <ErrorNote error={error} />
      {importResult && (
        <Note tone="ok">
          Imported {importResult.imported} row(s) from the POS file
          {importResult.itemsCreated > 0 && ` (${importResult.itemsCreated} new item(s) added to the master)`}.
          {importResult.skipped?.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer">{importResult.skipped.length} row(s) skipped</summary>
              <ul className="list-disc ml-5 text-xs">
                {importResult.skipped.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </details>
          )}
        </Note>
      )}
      {editable && showMinMax && lines.length === 0 && (
        <Note tone="warn">
          This DPR starts blank. Use <b>Import POS file</b> to load the min-max report (Excel/CSV) from POS — columns:
          Category, Item, UOM, Closing Stock, Buffer Days, Required Qty. You can also add items by hand under any category.
        </Note>
      )}
      {dpr.status === 'submitted' && (
        <Note tone="info">
          Submitted — signed by {dpr.hodSignName} on {new Date(dpr.hodSignDate).toLocaleString()}. Locked from further edits.
        </Note>
      )}

      {grouped.map((cat) => (
        <section key={cat.id} className="card mb-4 overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-2.5 bg-paper border-b border-line-soft text-left hover:bg-line-soft transition-colors"
            onClick={() => setCollapsed((c) => ({ ...c, [cat.id]: !c[cat.id] }))}
            aria-expanded={!collapsed[cat.id]}
          >
            <span className="text-sm font-semibold">{cat.name}</span>
            <span className="flex items-center gap-2 text-xs text-ink-faint">
              {cat.lines.length} item(s)
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-4 h-4 transition-transform ${collapsed[cat.id] ? '-rotate-90' : ''}`}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </span>
          </button>
          {!collapsed[cat.id] && (
            <div className="overflow-x-auto">
              <table className="tbl tbl-dense">
                <thead>
                  <tr>
                    <th className="w-8">#</th>
                    <th className="min-w-44">Item</th>
                    <th className="w-20">UOM</th>
                    <th className="w-24 text-right">Closing stock</th>
                    <th className="w-24 text-right">Buffer days</th>
                    {showMinMax && <th className="w-24 text-right">Suggested</th>}
                    <th className="w-28 text-right">Required qty</th>
                    <th className="min-w-36">Remark</th>
                    {editable && <th className="w-10"></th>}
                  </tr>
                </thead>
                <tbody>
                  {cat.lines.map((l, i) => (
                    <tr key={l._id || `new-${l.idx}`}>
                      <td className="text-ink-faint text-xs num text-left">{i + 1}</td>
                      <td>
                        {l.isManuallyAdded && editable ? (
                          <input
                            className={inputCls}
                            value={l.itemNameOverride}
                            placeholder="Item name"
                            onChange={(e) => updateLine(l.idx, 'itemNameOverride', e.target.value)}
                          />
                        ) : (
                          <span>
                            {l.itemNameOverride}
                            {l.isManuallyAdded && <span className="ml-1.5 stamp stamp-warn">manual</span>}
                          </span>
                        )}
                      </td>
                      <td className="text-ink-soft">
                        {l.isManuallyAdded && editable ? (
                          <input className={inputCls} value={l.uom} placeholder="kg / pc" onChange={(e) => updateLine(l.idx, 'uom', e.target.value)} />
                        ) : (
                          l.uom
                        )}
                      </td>
                      <td className="num text-ink-soft">{l.closingStock ?? '—'}</td>
                      <td className="num text-ink-soft">{l.bufferDays ?? '—'}</td>
                      {showMinMax && <td className="num text-ink-soft">{l.minMaxSuggestedQty ?? '—'}</td>}
                      <td className="num">
                        {editable ? (
                          <input
                            type="number"
                            min="0"
                            className={inputCls + ' num'}
                            value={l.requiredQty}
                            aria-label={`Required quantity for ${l.itemNameOverride || 'item'}`}
                            onChange={(e) => updateLine(l.idx, 'requiredQty', e.target.value === '' ? 0 : Number(e.target.value))}
                          />
                        ) : (
                          <span className="font-medium">{l.requiredQty}</span>
                        )}
                      </td>
                      <td>
                        {editable ? (
                          <input className={inputCls} value={l.remark} aria-label={`Remark for ${l.itemNameOverride || 'item'}`} onChange={(e) => updateLine(l.idx, 'remark', e.target.value)} />
                        ) : (
                          <span className="text-ink-soft">{l.remark}</span>
                        )}
                      </td>
                      {editable && (
                        <td className="text-center">
                          <button
                            className="p-1 rounded-md text-ink-faint hover:text-danger hover:bg-danger-soft transition-colors"
                            title={`Remove ${l.itemNameOverride || 'row'}`}
                            onClick={() => removeLine(l.idx)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {!cat.lines.length && (
                    <tr>
                      <td colSpan={showMinMax ? 9 : 8} className="text-center text-ink-faint text-xs py-4">
                        No items in {cat.name} yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {editable && (
                <div className="px-3 py-2 border-t border-line-soft">
                  <button className={btn('primary') + ' px-2.5 py-1 text-xs'} onClick={() => addLine(cat.id)}>
                    + Add item
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      ))}
    </Layout>
  );
}
