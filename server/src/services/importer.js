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
