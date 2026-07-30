import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import * as XLSX from 'xlsx';
import { DEPARTMENT_MASTER, DEMO_ITEMS } from './masterData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_DIR = path.resolve(__dirname, '../../sample-data');

// Writes sample POS min-max Excel files (one per feed department) that can be
// imported on the DPR screen. Returns the written file paths.
export function writeSampleFiles() {
  fs.mkdirSync(SAMPLE_DIR, { recursive: true });
  const written = [];
  for (const dept of DEPARTMENT_MASTER.filter((d) => d.hasMinMax)) {
    const rows = [];
    for (const catName of dept.categories) {
      for (const [item, uom] of DEMO_ITEMS[catName] || []) {
        const closing = Math.floor(Math.random() * 20);
        const buffer = 1 + Math.floor(Math.random() * 3);
        rows.push({
          Category: catName,
          Item: item,
          UOM: uom,
          'Closing Stock': closing,
          'Buffer Days': buffer,
          'Required Qty': Math.max(0, buffer * 8 - closing),
        });
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'MinMax');
    const file = path.join(SAMPLE_DIR, `pos-minmax-${dept.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.xlsx`);
    XLSX.writeFile(wb, file);
    written.push(file);
  }
  return written;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('Written:\n' + writeSampleFiles().join('\n'));
}
