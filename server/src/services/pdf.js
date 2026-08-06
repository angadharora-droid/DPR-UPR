import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const STORAGE_DIR = path.resolve(__dirname, '../../storage/uprs');

// Column layout (UPR template order: Buffer Days before Required Qty)
const COLS = [
  { key: 'sno', label: 'S.No', width: 30, align: 'center' },
  { key: 'itemName', label: 'Item', width: 170, align: 'left' },
  { key: 'uom', label: 'UOM', width: 45, align: 'center' },
  { key: 'closingStock', label: 'Closing Stock', width: 62, align: 'right' },
  { key: 'bufferDays', label: 'Buffer Days', width: 55, align: 'right' },
  { key: 'requiredQty', label: 'Required Qty', width: 62, align: 'right' },
  { key: 'remark', label: 'Remark', width: 91, align: 'left' },
];
const TABLE_WIDTH = COLS.reduce((s, c) => s + c.width, 0);
const MARGIN = 40;

const INK = '#1c2733';
const INK_SOFT = '#5c6773';
const NAVY = '#2f4f6f';
const NAVY_DARK = '#243d56';
const CAT_BG = '#e4ebf3';
const ZEBRA_BG = '#f5f8fb';
const LINE = '#d8dee5';
const HEAD_BG = '#edf1f5';
const SIGN_LINE = '#8b96a3';
const STATUS_COLORS = { draft: '#8a6d1a', verified: '#1d7a46', sent: '#2f4f6f' };

function num(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  const opts = n % 1 === 0 ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return n.toLocaleString('en-IN', opts);
}

export function generateUprPdf(upr) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  const fileName = `UPR-${upr.unit.name.replace(/[^a-z0-9]+/gi, '_')}-${upr.cycleDate}.pdf`;
  const filePath = path.join(STORAGE_DIR, fileName);

  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  const unitLabel = `${upr.unit.name}${upr.unit.city ? ', ' + upr.unit.city : ''}`;
  const bottomLimit = doc.page.height - MARGIN - 26; // keep clear of the footer strip

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

  // ---- Letterhead (first page only) ----
  doc.rect(0, 0, doc.page.width, 5).fill(NAVY);
  doc.font('Helvetica-Bold').fontSize(16).fillColor(INK).text('Centre Point Hospitality', MARGIN, 32, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(NAVY).text('UNIT PURCHASE REQUISITION', MARGIN, 37, { width: TABLE_WIDTH, align: 'right' });
  doc.moveTo(MARGIN, 56).lineTo(MARGIN + TABLE_WIDTH, 56).lineWidth(1).stroke(NAVY);

  const meta = [
    ['UNIT', unitLabel, 160],
    ['REQUISITION DATE', upr.cycleDate, 110],
    ['STATUS', (upr.status || '').toUpperCase() || '—', 80],
    ['ITEMS', `${upr.lines.length} across ${byDept.size} department${byDept.size === 1 ? '' : 's'}`, 165],
  ];
  const metaY = 66;
  let metaX = MARGIN;
  let metaBottom = metaY + 20;
  for (const [label, value, width] of meta) {
    doc.font('Helvetica').fontSize(6.5).fillColor(INK_SOFT).text(label, metaX, metaY, { width: width - 10 });
    const color = label === 'STATUS' ? STATUS_COLORS[upr.status] || INK : INK;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(color).text(value, metaX, metaY + 9, { width: width - 10 });
    metaBottom = Math.max(metaBottom, doc.y);
    metaX += width;
  }

  // ---- Table primitives ----
  function drawTableHeader(yy) {
    const h = 18;
    doc.rect(MARGIN, yy, TABLE_WIDTH, h).fill(HEAD_BG);
    let x = MARGIN;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK);
    for (const col of COLS) {
      doc.text(col.label, x + 3, yy + 5.5, { width: col.width - 6, align: col.align });
      x += col.width;
    }
    doc.moveTo(MARGIN, yy + h).lineTo(MARGIN + TABLE_WIDTH, yy + h).lineWidth(0.8).stroke(NAVY);
    return yy + h;
  }

  function drawDeptBand(yy, name, contd) {
    const h = 18;
    doc.rect(MARGIN, yy, TABLE_WIDTH, h).fill(NAVY);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff')
      .text(contd ? `${name} (contd.)` : name, MARGIN + 6, yy + 5, { width: TABLE_WIDTH - 12, lineBreak: false });
    return yy + h;
  }

  function drawCatBand(yy, name, count, contd) {
    const h = 15;
    doc.rect(MARGIN, yy, TABLE_WIDTH, h).fill(CAT_BG);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(NAVY_DARK)
      .text(contd ? `${name} (contd.)` : name, MARGIN + 6, yy + 4, { width: TABLE_WIDTH - 124, lineBreak: false });
    if (!contd) {
      doc.font('Helvetica').fontSize(7).fillColor(INK_SOFT)
        .text(`${count} item${count === 1 ? '' : 's'}`, MARGIN + TABLE_WIDTH - 110, yy + 4.5, { width: 104, align: 'right' });
    }
    return yy + h;
  }

  function measureRow(line, sno) {
    const cells = {
      sno: String(sno),
      itemName: line.itemName || '',
      uom: line.uom || '',
      closingStock: num(line.closingStock),
      bufferDays: num(line.bufferDays),
      requiredQty: num(line.requiredQty),
      remark: line.remark || '',
    };
    doc.font('Helvetica').fontSize(8);
    const rowH = Math.max(
      15,
      doc.heightOfString(cells.itemName, { width: COLS[1].width - 8 }) + 7,
      doc.heightOfString(cells.remark, { width: COLS[6].width - 8 }) + 7
    );
    return { cells, rowH };
  }

  function drawRow(yy, { cells, rowH }, zebra) {
    if (zebra) doc.rect(MARGIN, yy, TABLE_WIDTH, rowH).fill(ZEBRA_BG);
    let x = MARGIN;
    for (const col of COLS) {
      const emphasis = col.key === 'requiredQty';
      const muted = col.key === 'sno' || col.key === 'uom' || col.key === 'remark';
      doc.font(emphasis ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
        .fillColor(emphasis ? NAVY_DARK : muted ? INK_SOFT : INK);
      doc.text(cells[col.key], x + 4, yy + 4, { width: col.width - 8, align: col.align });
      x += col.width;
    }
    doc.lineWidth(0.5);
    doc.moveTo(MARGIN, yy + rowH).lineTo(MARGIN + TABLE_WIDTH, yy + rowH).stroke(LINE);
    x = MARGIN;
    doc.moveTo(x, yy).lineTo(x, yy + rowH).stroke(LINE);
    for (const col of COLS) {
      x += col.width;
      doc.moveTo(x, yy).lineTo(x, yy + rowH).stroke(LINE);
    }
    return yy + rowH;
  }

  // ---- Table body: repeat the header and the open department/category on page breaks ----
  let y = metaBottom + 14;
  let currentDept = null;
  let currentCat = null;

  function newPage() {
    doc.addPage();
    y = MARGIN;
    y = drawTableHeader(y);
    if (currentDept) y = drawDeptBand(y, currentDept, true);
    if (currentCat) y = drawCatBand(y, currentCat, 0, true);
  }
  function ensureSpace(needed) {
    if (y + needed > bottomLimit) newPage();
  }

  y = drawTableHeader(y);
  for (const [deptName, byCat] of byDept) {
    currentDept = null;
    currentCat = null;
    ensureSpace(18 + 15 + 24);
    y = drawDeptBand(y, deptName, false);
    currentDept = deptName;
    for (const [catName, lines] of byCat) {
      currentCat = null;
      ensureSpace(15 + 24);
      y = drawCatBand(y, catName, lines.length, false);
      currentCat = catName;
      let sno = 1;
      let rowIdx = 0;
      for (const line of lines) {
        const m = measureRow(line, sno++);
        ensureSpace(m.rowH);
        y = drawRow(y, m, rowIdx % 2 === 1);
        rowIdx++;
      }
    }
  }
  currentDept = null;
  currentCat = null;

  // Totals band
  ensureSpace(22);
  doc.rect(MARGIN, y, TABLE_WIDTH, 18).fill(HEAD_BG);
  doc.moveTo(MARGIN, y).lineTo(MARGIN + TABLE_WIDTH, y).lineWidth(0.8).stroke(NAVY);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text('Total', MARGIN + 6, y + 5, { lineBreak: false });
  doc.text(
    `${upr.lines.length} item${upr.lines.length === 1 ? '' : 's'} · ${byDept.size} department${byDept.size === 1 ? '' : 's'}`,
    MARGIN, y + 5, { width: TABLE_WIDTH - 6, align: 'right' }
  );
  y += 18;

  // ---- Signature block ----
  if (y + 96 > bottomLimit) {
    doc.addPage();
    y = MARGIN;
  }
  const sigW = 205;
  const sigLineY = y + 58;
  const rightX = MARGIN + TABLE_WIDTH - sigW;
  const signedAt = upr.verifiedAt
    ? new Date(upr.verifiedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  if (upr.verifiedSignName) {
    doc.font('Helvetica-Oblique').fontSize(12).fillColor(INK)
      .text(upr.verifiedSignName, MARGIN, sigLineY - 17, { width: sigW, align: 'center' });
  }
  doc.lineWidth(0.8);
  doc.moveTo(MARGIN, sigLineY).lineTo(MARGIN + sigW, sigLineY).stroke(SIGN_LINE);
  doc.moveTo(rightX, sigLineY).lineTo(rightX + sigW, sigLineY).stroke(SIGN_LINE);

  doc.font('Helvetica-Bold').fontSize(8).fillColor(INK);
  doc.text('Unit Head — Prepared & Verified', MARGIN, sigLineY + 5, { width: sigW });
  doc.text('Purchase Head — Received', rightX, sigLineY + 5, { width: sigW });

  doc.font('Helvetica').fontSize(7.5).fillColor(INK_SOFT);
  if (signedAt) doc.text(`Signed: ${signedAt}`, MARGIN, sigLineY + 16, { width: sigW });
  doc.text('Date: ____________________', rightX, sigLineY + 16, { width: sigW });

  // ---- Footer on every page ----
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // footer sits inside the margin; stop pdfkit adding a page
    const fy = doc.page.height - 26;
    doc.moveTo(MARGIN, fy - 5).lineTo(MARGIN + TABLE_WIDTH, fy - 5).lineWidth(0.5).stroke(LINE);
    doc.font('Helvetica').fontSize(7).fillColor(INK_SOFT);
    doc.text(`UPR · ${unitLabel} · ${upr.cycleDate}`, MARGIN, fy, { lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, MARGIN, fy, { width: TABLE_WIDTH, align: 'right' });
    doc.page.margins.bottom = savedBottom;
  }

  doc.end();
  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve({ filePath, fileName }));
    stream.on('error', reject);
  });
}
