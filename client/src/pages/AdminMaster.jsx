import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Layout, { ErrorNote, btn, inputCls } from '../components/Layout.jsx';

export default function AdminMaster() {
  const [units, setUnits] = useState([]);
  const [unitId, setUnitId] = useState('');
  const [departments, setDepartments] = useState([]);
  const [deptId, setDeptId] = useState('');
  const [categories, setCategories] = useState([]);
  const [catId, setCatId] = useState('');
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [newCat, setNewCat] = useState('');
  const [newItem, setNewItem] = useState({ name: '', uom: '', isPosLinked: false });

  useEffect(() => {
    api('/admin/units').then((u) => {
      setUnits(u);
      if (u.length && !unitId) setUnitId(u[0]._id);
    }).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!unitId) return;
    setDeptId('');
    setCategories([]);
    setCatId('');
    setItems([]);
    api(`/master/departments?unitId=${unitId}`).then((d) => {
      setDepartments(d);
      if (d.length) setDeptId(d[0]._id);
    }).catch((e) => setError(e.message));
  }, [unitId]);

  useEffect(() => {
    if (!deptId) return;
    setCatId('');
    setItems([]);
    api(`/master/categories?departmentId=${deptId}`).then((c) => {
      setCategories(c);
      if (c.length) setCatId(c[0]._id);
    }).catch((e) => setError(e.message));
  }, [deptId]);

  useEffect(() => {
    if (!catId) {
      setItems([]);
      return;
    }
    api(`/master/items?categoryId=${catId}`).then(setItems).catch((e) => setError(e.message));
  }, [catId]);

  const dept = departments.find((d) => d._id === deptId);

  async function addCategory() {
    try {
      await api('/master/categories', { method: 'POST', body: { departmentId: deptId, name: newCat } });
      setNewCat('');
      const c = await api(`/master/categories?departmentId=${deptId}`);
      setCategories(c);
    } catch (e) {
      setError(e.message);
    }
  }

  async function addItem() {
    try {
      await api('/master/items', { method: 'POST', body: { categoryId: catId, ...newItem } });
      setNewItem({ name: '', uom: '', isPosLinked: false });
      setItems(await api(`/master/items?categoryId=${catId}`));
    } catch (e) {
      setError(e.message);
    }
  }

  async function deactivateItem(item) {
    try {
      await api(`/master/items/${item._id}`, { method: 'PUT', body: { active: false } });
      setItems(await api(`/master/items?categoryId=${catId}`));
    } catch (e) {
      setError(e.message);
    }
  }

  const sel = (value, onChange, options, labelKey = 'name') => (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o._id} value={o._id}>{o[labelKey]}</option>
      ))}
    </select>
  );

  return (
    <Layout title="Master data" subtitle="Departments, categories and items per unit">
      <ErrorNote error={error} />
      <div className="card p-4 grid md:grid-cols-3 gap-3 mb-6">
        <div>
          <label className="block text-xs text-ink-soft mb-1">Unit</label>
          {sel(unitId, setUnitId, units)}
        </div>
        <div>
          <label className="block text-xs text-ink-soft mb-1">Department</label>
          {sel(deptId, setDeptId, departments)}
        </div>
        <div>
          <label className="block text-xs text-ink-soft mb-1">Category</label>
          {sel(catId, setCatId, categories)}
        </div>
        {dept && (
          <p className="md:col-span-3 text-sm text-ink-soft border-t border-line-soft pt-3 mb-0">
            {dept.name}{' '}
            {dept.hasMinMax
              ? 'receives the POS min-max feed.'
              : 'is manual-only (no POS feed) — items here are optional; department heads can type items free-form.'}
          </p>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-4">
          <h2 className="font-display text-base font-semibold mb-3">Categories in {dept?.name || '…'}</h2>
          <ul className="text-sm divide-y divide-line-soft mb-4">
            {categories.map((c) => (
              <li key={c._id} className="py-2 flex justify-between">
                <span>{c.name}</span>
                <span className="text-xs text-ink-faint font-mono">order {c.sortOrder}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input className={inputCls} placeholder="New category name" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
            <button className={btn('green')} onClick={addCategory} disabled={!newCat || !deptId}>Add</button>
          </div>
        </div>

        <div className="card p-4">
          <h2 className="font-display text-base font-semibold mb-3">Items in {categories.find((c) => c._id === catId)?.name || '…'}</h2>
          <table className="tbl tbl-dense mb-4">
            <thead>
              <tr><th>Item</th><th>UOM</th><th>Source</th><th></th></tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i._id}>
                  <td>{i.name}</td>
                  <td className="text-ink-soft">{i.uom}</td>
                  <td>
                    <span className={`stamp ${i.isPosLinked ? 'stamp-info' : 'stamp-warn'}`}>{i.isPosLinked ? 'POS' : 'Manual'}</span>
                  </td>
                  <td className="text-right">
                    <button className="text-danger/80 text-xs underline underline-offset-2 hover:text-danger" onClick={() => deactivateItem(i)}>deactivate</button>
                  </td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={4} className="text-center text-ink-faint py-4">No items in this category yet</td></tr>}
            </tbody>
          </table>
          <div className="grid grid-cols-5 gap-2 items-center">
            <input className={inputCls + ' col-span-2'} placeholder="Item name" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} />
            <input className={inputCls} placeholder="UOM" value={newItem.uom} onChange={(e) => setNewItem({ ...newItem, uom: e.target.value })} />
            <label className="text-xs flex items-center gap-1.5 text-ink-soft">
              <input type="checkbox" className="accent-brand" checked={newItem.isPosLinked} onChange={(e) => setNewItem({ ...newItem, isPosLinked: e.target.checked })} />
              POS
            </label>
            <button className={btn('green')} onClick={addItem} disabled={!newItem.name || !newItem.uom || !catId}>Add</button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
