import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const STORAGE_DIR = path.resolve(__dirname, '../../storage/uprs');

// Column layout (UPR template order: Buffer Days before Required Qty)
const COLS = [
  { key: 'sno', label: 'S.No', width: 32, align: 'center' },
  { key: 'itemName', label: 'Item', width: 168, align: 'left' },
  { key: 'uom', label: 'UOM', width: 45, align: 'center' },
  { key: 'closingStock', label: 'Closing Stock', width: 62, align: 'right' },
  { key: 'bufferDays', label: 'Buffer Days', width: 55, align: 'right' },
  { key: 'requiredQty', label: 'Required Qty', width: 62, align: 'right' },
  { key: 'remark', label: 'Remark', width: 91, align: 'left' },
];
const TABLE_WIDTH = COLS.reduce((s, c) => s + c.width, 0);
const MARGIN = 40;

function num(v) {
  if (v === null || v === undefined || v === '') return '';
  return Number(v) % 1 === 0 ? String(Number(v)) : Number(v).toFixed(2);
}

export function generateUprPdf(upr) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  const fileName = `UPR-${upr.unit.name.replace(/[^a-z0-9]+/gi, '_')}-${upr.cycleDate}.pdf`;
  const filePath = path.join(STORAGE_DIR, fileName);

  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  // Header
  doc.font('Helvetica-Bold').fontSize(15).text('Centre Point Hospitality', { align: 'center' });
  doc.fontSize(12).text(`Unit Purchase Requisition — ${upr.unit.name}${upr.unit.city ? ', ' + upr.unit.city : ''}`, { align: 'center' });
  doc.font('Helvetica').fontSize(9).text(`Requisition Date: ${upr.cycleDate}`, { align: 'center' });
  doc.moveDown(0.8);

  const bottomLimit = doc.page.height - MARGIN - 40;

  function drawHeaderRow(y) {
    let x = MARGIN;
    doc.font('Helvetica-Bold').fontSize(7.5);
    doc.rect(MARGIN, y, TABLE_WIDTH, 16).fillAndStroke('#e8e8e8', '#999');
    doc.fillColor('#000');
    for (const col of COLS) {
      doc.text(col.label, x + 2, y + 4, { width: col.width - 4, align: col.align });
      x += col.width;
    }
    return y + 16;
  }

  function drawLineRow(y, line, sno) {
    doc.font('Helvetica').fontSize(7.5);
    const cells = {
      sno: String(sno),
      itemName: line.itemName || '',
      uom: line.uom || '',
      closingStock: num(line.closingStock),
      bufferDays: num(line.bufferDays),
      requiredQty: num(line.requiredQty),
      remark: line.remark || '',
    };
    const rowH = Math.max(
      14,
      doc.heightOfString(cells.itemName, { width: COLS[1].width - 4 }) + 6,
      doc.heightOfString(cells.remark, { width: COLS[6].width - 4 }) + 6
    );
    let x = MARGIN;
    doc.rect(MARGIN, y, TABLE_WIDTH, rowH).stroke('#ccc');
    for (const col of COLS) {
      doc.text(cells[col.key], x + 2, y + 3, { width: col.width - 4, align: col.align });
      x += col.width;
    }
    return y + rowH;
  }

  function sectionTitle(y, text, level) {
    const h = 16;
    doc.rect(MARGIN, y, TABLE_WIDTH, h).fillAndStroke(level === 0 ? '#2f4f6f' : '#d8e2ec', '#999');
    doc.fillColor(level === 0 ? '#fff' : '#1a2a3a').font('Helvetica-Bold').fontSize(level === 0 ? 9 : 8);
    doc.text(text, MARGIN + 4, y + 4, { width: TABLE_WIDTH - 8 });
    doc.fillColor('#000');
    return y + h;
  }

  // Group lines: Department -> Category
  const byDept = new Map();
  for (const line of upr.lines) {
    const d = line.departmentName || 'Department';
    if (!byDept.has(d)) byDept.set(d, new Map());
    const byCat = byDept.get(d);
    const c = line.categoryName || 'Other';
    if (!byCat.has(c)) byCat.set(c, []);
    byCat.get(c).push(line);
  }

  let y = doc.y;
  function ensureSpace(needed) {
    if (y + needed > bottomLimit) {
      doc.addPage();
      y = MARGIN;
      y = drawHeaderRow(y);
    }
  }

  y = drawHeaderRow(y);
  for (const [deptName, byCat] of byDept) {
    ensureSpace(40);
    y = sectionTitle(y, deptName, 0);
    for (const [catName, lines] of byCat) {
      ensureSpace(36);
      y = sectionTitle(y, catName, 1);
      let sno = 1;
      for (const line of lines) {
        ensureSpace(20);
        y = drawLineRow(y, line, sno++);
      }
    }
  }

  // Signature block
  if (y + 60 > bottomLimit) {
    doc.addPage();
    y = MARGIN;
  }
  y += 24;
  doc.font('Helvetica').fontSize(9);
  const signedAt = upr.verifiedAt ? new Date(upr.verifiedAt).toLocaleString('en-IN') : '';
  doc.text(`Unit Head Sign: ${upr.verifiedSignName || ''}`, MARGIN, y);
  doc.text(`Date: ${signedAt}`, MARGIN + 300, y);

  doc.end();
  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve({ filePath, fileName }));
    stream.on('error', reject);
  });
}
