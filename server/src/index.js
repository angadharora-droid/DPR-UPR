import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import authRoutes from './routes/auth.js';
import adminUnitRoutes from './routes/adminUnits.js';
import adminUserRoutes from './routes/adminUsers.js';
import adminMasterRoutes from './routes/adminMaster.js';
import minmaxRoutes from './routes/minmax.js';
import dprRoutes from './routes/dpr.js';
import uprRoutes from './routes/upr.js';
import reportRoutes from './routes/reports.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/admin/units', adminUnitRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/master', adminMasterRoutes);
app.use('/api/minmax', minmaxRoutes);
app.use('/api/dpr', dprRoutes);
app.use('/api/upr', uprRoutes);
app.use('/api/reports', reportRoutes);

// In production the built client is served by this same server (single Railway service).
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

const PORT = process.env.PORT || 5001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/dpr_upr';

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
