import * as XLSX from 'xlsx';
import Category from '../models/Category.js';
import Item from '../models/Item.js';

// Parses an Excel (.xlsx/.xls) or CSV buffer into rows with normalized keys
// (e.g. "Closing Stock" -> closing_stock). First sheet only, header row required.
export function parseSpreadsheet(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return rows.map((r) => {
    const norm = {};
    for (const [k, v] of Object.entries(r)) {
      const key = String(k).trim().toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '');
      norm[key] = typeof v === 'string' ? v.trim() : v;
    }
    return norm;
  });
}

// Parses a POS raw-material export or report (.xlsx/.xls/.csv) into catalog
// entries. Handles both file shapes: the bare export (header on the first row)
// and the printable report (title/restaurant preamble rows above the header) —
// the header row is located by the presence of "Name" and "Purchase Unit".
// Inactive rows (Active = "No") are skipped; duplicate names keep the first.
export function parseRawMaterials(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) : [];
  const cell = (v) => String(v ?? '').trim();
  const headerIdx = rows.findIndex((r) => {
    const cells = r.map((c) => cell(c).toLowerCase());
    return cells.includes('name') && cells.includes('purchase unit');
  });
  if (headerIdx === -1)
    throw new Error('Header row not found — expected columns "Name" and "Purchase Unit"');
  const header = rows[headerIdx].map((c) => cell(c).toLowerCase());
  const col = (label) => header.indexOf(label);
  const iName = col('name');
  const iPurchase = col('purchase unit');
  const iConsumption = col('consumption unit');
  const iCategory = col('category');
  const iSub = col('sub category');
  const iActive = col('active');

  const seen = new Set();
  const materials = [];
  let skippedInactive = 0;
  let duplicates = 0;
  for (const r of rows.slice(headerIdx + 1)) {
    const name = cell(r[iName]);
    if (!name) continue;
    if (iActive !== -1 && cell(r[iActive]).toLowerCase() === 'no') {
      skippedInactive++;
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    materials.push({
      name,
      uom: cell(r[iPurchase]) || (iConsumption !== -1 ? cell(r[iConsumption]) : '') || 'unit',
      consumptionUnit: iConsumption === -1 ? '' : cell(r[iConsumption]),
      category: iCategory === -1 ? '' : cell(r[iCategory]),
      subCategory: iSub === -1 ? '' : cell(r[iSub]),
    });
  }
  return { materials, skippedInactive, duplicates };
}

// Expected columns: Category, Item, UOM, Closing Stock, Buffer Days, Required Qty.
// Unknown categories are reported and skipped; unknown items are auto-created as POS-linked.
export async function buildMinMaxLines(dept, records) {
  const categories = await Category.find({ department: dept._id });
  const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));

  const lines = [];
  const errors = [];
  let created = 0;
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const catName = String(r.category || '').toLowerCase();
    const itemName = String(r.item || r.item_name || '').trim();
    if (!catName || !itemName) {
      errors.push(`Row ${i + 2}: missing category or item`);
      continue;
    }
    const cat = catByName.get(catName);
    if (!cat) {
      errors.push(`Row ${i + 2}: unknown category "${r.category}" for ${dept.name}`);
      continue;
    }
    let item = await Item.findOne({
      category: cat._id,
      name: new RegExp(`^${itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    });
    if (!item) {
      item = await Item.create({ category: cat._id, name: itemName, uom: String(r.uom || 'unit'), isPosLinked: true });
      created++;
    }
    lines.push({
      item: item._id,
      category: cat._id,
      closingStock: Number(r.closing_stock || 0),
      bufferDays: Number(r.buffer_days || 0),
      systemRequiredQty: Number(r.required_qty || 0),
    });
  }
  return { lines, errors, created };
}
