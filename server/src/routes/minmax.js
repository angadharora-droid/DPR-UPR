import { Router } from 'express';
import multer from 'multer';
import Department from '../models/Department.js';
import MinMaxReport from '../models/MinMaxReport.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { logAudit } from '../services/audit.js';
import { parseSpreadsheet, buildMinMaxLines } from '../services/importer.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authRequired, requireRole('admin'));

// Optional central archive upload of a POS min-max feed (Excel/CSV).
// Day-to-day, Department Heads import the POS file directly on their DPR screen.
router.post('/import', upload.single('file'), async (req, res, next) => {
  try {
    const { unitId, departmentId, reportDate } = req.body;
    if (!unitId || !departmentId || !req.file)
      return res.status(400).json({ error: 'unitId, departmentId and file required' });

    const dept = await Department.findOne({ _id: departmentId, unit: unitId });
    if (!dept) return res.status(404).json({ error: 'Department not found in unit' });
    if (!dept.hasMinMax)
      return res.status(400).json({ error: `${dept.name} does not receive a min-max feed` });

    let records;
    try {
      records = parseSpreadsheet(req.file.buffer);
    } catch (e) {
      return res.status(400).json({ error: 'File parse failed: ' + e.message });
    }
    if (!records.length) return res.status(400).json({ error: 'File has no data rows' });

    const { lines, errors, created } = await buildMinMaxLines(dept, records);
    if (!lines.length) return res.status(400).json({ error: 'No valid rows', details: errors });

    const report = await MinMaxReport.create({
      unit: unitId,
      department: departmentId,
      reportDate: reportDate ? new Date(reportDate) : new Date(),
      source: req.file.originalname,
      uploadedBy: req.user._id,
      lines,
    });
    await logAudit({ entityType: 'min_max_report', entityId: report._id, action: 'import', changedBy: req.user._id, newValue: { unitId, departmentId, rows: lines.length, itemsCreated: created } });
    res.status(201).json({ id: report._id, imported: lines.length, itemsCreated: created, skipped: errors });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { unitId, departmentId } = req.query;
    const q = {};
    if (unitId) q.unit = unitId;
    if (departmentId) q.department = departmentId;
    const reports = await MinMaxReport.find(q)
      .select('-lines')
      .populate('unit', 'name')
      .populate('department', 'name')
      .populate('uploadedBy', 'name role')
      .sort({ reportDate: -1 })
      .limit(50);
    res.json(reports);
  } catch (err) {
    next(err);
  }
});

export default router;
