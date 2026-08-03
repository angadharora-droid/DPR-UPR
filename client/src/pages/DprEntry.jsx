import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import Layout, { StatusBadge, ErrorNote, Note, btn, inputCls } from '../components/Layout.jsx';

function mapLines(dprLines) {
  return dprLines.map((l) => ({
    ...l,
    category: l.category?._id || l.category || null,
    categoryName: l.category?.name || l.categoryName || 'Other',
  }));
}

// Bold the query terms inside a suggestion name.
function Highlight({ text, q }) {
  const terms = String(q || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return text;
  const lower = text.toLowerCase();
  const ranges = [];
  for (const t of terms) {
    let i = 0;
    while ((i = lower.indexOf(t, i)) !== -1) {
      ranges.push([i, i + t.length]);
      i += t.length;
    }
  }
  if (!ranges.length) return text;
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  const parts = [];
  let pos = 0;
  merged.forEach(([s, e], i) => {
    if (s > pos) parts.push(<span key={`p${i}`}>{text.slice(pos, s)}</span>);
    parts.push(<span key={`h${i}`} className="font-semibold text-brand-deep">{text.slice(s, e)}</span>);
    pos = e;
  });
  if (pos < text.length) parts.push(<span key="tail">{text.slice(pos)}</span>);
  return parts;
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
  const [rmTotal, setRmTotal] = useState(0);
  const [quickAdd, setQuickAdd] = useState('');
  const [suggest, setSuggest] = useState(null); // { key, q, results, more, rect }
  const [activeIdx, setActiveIdx] = useState(0);
  const [searching, setSearching] = useState(false);
  const [addedNote, setAddedNote] = useState(null); // { name, cat }
  const searchTimer = useRef(null);
  const searchSeq = useRef(0);
  const addedTimer = useRef(null);

  const editable = user.role === 'dept_head' && dpr?.status === 'draft';
  // With a raw-material catalog loaded, entry is search-first: categories come
  // from the Excel and sections appear only once they hold items.
  const catalogMode = rmTotal > 0;

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

  useEffect(() => {
    if (user.role !== 'dept_head') return;
    api('/master/raw-materials?q=')
      .then((r) => setRmTotal(r.total))
      .catch(() => {}); // no catalog uploaded yet — inputs stay plain
  }, [user.role]);

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
    if (catalogMode) {
      const orderOf = new Map(categories.map((c, i) => [c.name.trim().toLowerCase(), c.sortOrder ?? i]));
      const groups = new Map();
      lines.forEach((l, idx) => {
        const label = String(l.categoryName || 'Other').trim() || 'Other';
        const key = label.toLowerCase();
        if (!groups.has(key)) groups.set(key, { id: key, name: label, lines: [] });
        groups.get(key).lines.push({ ...l, idx });
      });
      const rank = (g) =>
        g.id === 'other' ? Number.MAX_SAFE_INTEGER : orderOf.has(g.id) ? orderOf.get(g.id) : 100000;
      return [...groups.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    }
    const catList = [...categories.map((c) => ({ id: String(c._id), name: c.name })), { id: 'other', name: 'Other' }];
    return catList
      .map((cat) => ({
        ...cat,
        lines: lines
          .map((l, idx) => ({ ...l, idx }))
          .filter((l) => (cat.id === 'other' ? !l.category : String(l.category) === cat.id)),
      }))
      .filter((cat) => cat.lines.length > 0 || (editable && cat.id !== 'other') || (editable && cat.id === 'other'));
  }, [categories, lines, editable, catalogMode]);

  function updateLine(idx, field, value) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
    setDirty(true);
  }

  function removeLine(idx) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  }

  function blankLine() {
    return {
      category: null,
      categoryName: 'Other',
      item: null,
      itemNameOverride: '',
      uom: '',
      closingStock: null,
      bufferDays: null,
      minMaxSuggestedQty: null,
      requiredQty: 0,
      remark: '',
      isManuallyAdded: true,
    };
  }

  function addLine(categoryId) {
    const cat = categories.find((c) => String(c._id) === String(categoryId));
    setLines((prev) => [
      ...prev,
      { ...blankLine(), category: categoryId === 'other' ? null : categoryId, categoryName: cat?.name || 'Other' },
    ]);
    setDirty(true);
  }

  // ---- Raw-material autocomplete (unit catalog uploaded by Admin → Units) ----

  function searchRawMaterials(key, q, rect) {
    clearTimeout(searchTimer.current);
    const query = q.trim();
    if (!rmTotal || query.length < 2) {
      setSuggest(null);
      setSearching(false);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const r = await api(`/master/raw-materials?q=${encodeURIComponent(query)}`);
        if (searchSeq.current === seq) {
          setSuggest({ key, q: query, results: r.results, more: r.more, rect });
          setActiveIdx(0);
        }
      } catch {
        // suggestions are best-effort; typing still works without them
      } finally {
        if (searchSeq.current === seq) setSearching(false);
      }
    }, 200);
  }

  function matchCategory(rmCat) {
    const norm = (s) => String(s || '').trim().toLowerCase();
    if (!norm(rmCat)) return null;
    const hit = categories.find((c) => norm(c.name) === norm(rmCat));
    return hit ? String(hit._id) : null;
  }

  function flashAdded(name, cat) {
    clearTimeout(addedTimer.current);
    setAddedNote({ name, cat });
    addedTimer.current = setTimeout(() => setAddedNote(null), 3000);
  }

  function closeSuggest() {
    setSuggest(null);
    setSearching(false);
  }

  function pickRawMaterial(idx, rm) {
    const catName = String(rm.category || '').trim();
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const next = { ...l, itemNameOverride: rm.name, uom: rm.uom || l.uom };
        if (catName) {
          next.categoryName = catName;
          next.category = matchCategory(catName); // null → created server-side on save
        }
        return next;
      })
    );
    if (catName) setCollapsed((c) => ({ ...c, [catName.toLowerCase()]: false }));
    closeSuggest();
    setDirty(true);
  }

  function quickAddPick(rm) {
    const catName = String(rm.category || '').trim();
    setLines((prev) => [
      ...prev,
      {
        ...blankLine(),
        category: catName ? matchCategory(catName) : null,
        categoryName: catName || 'Other',
        itemNameOverride: rm.name,
        uom: rm.uom || '',
      },
    ]);
    setCollapsed((c) => ({ ...c, [(catName || 'other').toLowerCase()]: false }));
    setQuickAdd('');
    closeSuggest();
    setDirty(true);
    flashAdded(rm.name, catName || 'Other');
  }

  function addManualLine(name) {
    setLines((prev) => [...prev, { ...blankLine(), itemNameOverride: name || '' }]);
    setCollapsed((c) => ({ ...c, other: false }));
    setQuickAdd('');
    closeSuggest();
    setDirty(true);
    if (name) flashAdded(name, 'Other');
  }

  function applyPick(key, rm) {
    if (key === 'global') quickAddPick(rm);
    else pickRawMaterial(Number(key.slice(5)), rm);
  }

  function handleSuggestKeys(e, key) {
    if (e.key === 'Escape') {
      closeSuggest();
      return;
    }
    if (suggest?.key !== key) return;
    const n = suggest.results.length;
    if (e.key === 'ArrowDown' && n) {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % n);
    } else if (e.key === 'ArrowUp' && n) {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + n) % n);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (n) applyPick(key, suggest.results[Math.max(0, Math.min(activeIdx, n - 1))]);
      else if (key === 'global' && suggest.q) addManualLine(suggest.q);
    }
  }

  const closeSuggestSoon = () => setTimeout(() => closeSuggest(), 150);

  function linesPayload() {
    return lines.map((l) => ({
      category: l.category,
      categoryName: l.categoryName || '',
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

  function refreshCategories() {
    if (!dpr?.department?._id) return;
    api(`/master/categories?departmentId=${dpr.department._id}`).then(setCategories).catch(() => {});
  }

  async function saveDraft() {
    setBusy(true);
    setError('');
    try {
      const d = await api(`/dpr/${id}`, { method: 'PUT', body: { lines: linesPayload() } });
      setLines(mapLines(d.lines));
      setDirty(false);
      refreshCategories();
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
      {editable && lines.length === 0 && (
        <Note tone="warn">
          {catalogMode ? (
            <>
              This DPR starts blank. Search below to add items — the name, UOM and category fill in
              automatically from the raw-material catalog
              {showMinMax && <>, or use <b>Import POS file</b> to load the min-max report</>}.
            </>
          ) : showMinMax ? (
            <>
              This DPR starts blank. Use <b>Import POS file</b> to load the min-max report (Excel/CSV) from POS — columns:
              Category, Item, UOM, Closing Stock, Buffer Days, Required Qty. You can also add items by hand under any category.
            </>
          ) : (
            <>This DPR starts blank — add items by hand under the category headers below.</>
          )}
        </Note>
      )}
      {dpr.status === 'submitted' && (
        <Note tone="info">
          Submitted — signed by {dpr.hodSignName} on {new Date(dpr.hodSignDate).toLocaleString()}. Locked from further edits.
        </Note>
      )}

      {suggest && (
        <div
          className="fixed z-50 rounded-lg border border-line bg-surface shadow-lg max-h-72 overflow-auto"
          style={{
            left: suggest.rect.left,
            top: suggest.rect.bottom + 4,
            width: Math.min(Math.max(suggest.rect.width, 320), window.innerWidth - suggest.rect.left - 12),
          }}
        >
          {suggest.results.map((rm, i) => (
            <button
              key={rm._id}
              type="button"
              ref={i === activeIdx ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
              className={`w-full text-left px-3 py-2 flex items-baseline justify-between gap-3 text-sm transition-colors ${
                i === activeIdx ? 'bg-brand-soft' : 'hover:bg-line-soft'
              }`}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                applyPick(suggest.key, rm);
              }}
            >
              <span className="truncate">
                <Highlight text={rm.name} q={suggest.q} />
              </span>
              <span className="text-xs text-ink-faint whitespace-nowrap shrink-0">
                {rm.uom}
                {rm.category ? <span className="ml-1.5 stamp stamp-neutral">{rm.category}</span> : null}
              </span>
            </button>
          ))}
          {suggest.results.length === 0 && (
            <div className="px-3 py-2 text-xs text-ink-faint">No matching raw materials</div>
          )}
          {suggest.key === 'global' && suggest.q && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-ink-soft border-t border-line-soft hover:bg-line-soft"
              onMouseDown={(e) => {
                e.preventDefault();
                addManualLine(suggest.q);
              }}
            >
              + Add “{suggest.q}” as a manual item <span className="text-xs text-ink-faint">(goes to Other)</span>
            </button>
          )}
          {suggest.more && (
            <div className="px-3 py-1.5 text-[11px] text-ink-faint border-t border-line-soft">
              More matches exist — keep typing to narrow the list
            </div>
          )}
        </div>
      )}

      {editable && catalogMode && (
        <div className="card p-4 mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
            <label className="block text-xs font-medium text-ink-soft" htmlFor="rm-search">
              Add items — search the unit's {rmTotal.toLocaleString()} raw materials
            </label>
            <button
              className="text-xs text-ink-faint hover:text-ink underline underline-offset-2"
              onClick={() => addManualLine(quickAdd.trim())}
            >
              Can't find it? Add manually
            </button>
          </div>
          <div className="relative">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              id="rm-search"
              className={inputCls + ' pl-9 py-2.5'}
              value={quickAdd}
              placeholder="Start typing an item name — e.g. chicken, lemon, dettol…"
              autoComplete="off"
              onChange={(e) => {
                setQuickAdd(e.target.value);
                searchRawMaterials('global', e.target.value, e.target.getBoundingClientRect());
              }}
              onKeyDown={(e) => handleSuggestKeys(e, 'global')}
              onBlur={closeSuggestSoon}
            />
            {searching && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-ink-faint">
                Searching…
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-ink-faint">
            ↑↓ to choose, Enter to add — the item lands under its own category with the right UOM automatically.
          </p>
          {addedNote && (
            <p className="mt-1 text-xs text-ok">
              Added “{addedNote.name}” under <b>{addedNote.cat}</b>.
            </p>
          )}
        </div>
      )}

      {catalogMode && lines.length === 0 && !editable && (
        <div className="card px-6 py-10 text-center text-ink-faint text-sm">No items.</div>
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
                            placeholder={rmTotal ? 'Type to search catalog' : 'Item name'}
                            onChange={(e) => {
                              updateLine(l.idx, 'itemNameOverride', e.target.value);
                              searchRawMaterials(`line-${l.idx}`, e.target.value, e.target.getBoundingClientRect());
                            }}
                            onKeyDown={(e) => handleSuggestKeys(e, `line-${l.idx}`)}
                            onBlur={closeSuggestSoon}
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
              {editable && !catalogMode && (
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
