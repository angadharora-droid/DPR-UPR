import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import Unit from './models/Unit.js';
import Department from './models/Department.js';
import Category from './models/Category.js';
import Item from './models/Item.js';
import User from './models/User.js';
import MinMaxReport from './models/MinMaxReport.js';
import Dpr from './models/Dpr.js';
import Upr from './models/Upr.js';
import AuditLog from './models/AuditLog.js';
import { DEPARTMENT_MASTER, DEMO_ITEMS } from './masterData.js';
import { writeSampleFiles } from './makeSamples.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/dpr_upr';

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to', MONGODB_URI);

  const wipe = process.argv.includes('--fresh');
  if (wipe) {
    await Promise.all(
      [Unit, Department, Category, Item, User, MinMaxReport, Dpr, Upr, AuditLog].map((m) => m.deleteMany({}))
    );
    console.log('Wiped existing data');
  }

  // Admin
  let admin = await User.findOne({ email: 'admin@cph.local' });
  if (!admin) {
    admin = await User.create({
      name: 'Group Admin',
      email: 'admin@cph.local',
      role: 'admin',
      passwordHash: await bcrypt.hash('admin123', 10),
    });
    console.log('Created admin@cph.local / admin123');
  }

  // Purchase Head (central, one for the whole group)
  if (!(await User.findOne({ email: 'purchase@cph.local' }))) {
    await User.create({
      name: 'Purchase Head',
      email: 'purchase@cph.local',
      role: 'purchase_head',
      passwordHash: await bcrypt.hash('purchase123', 10),
    });
    console.log('Created purchase@cph.local / purchase123');
  }

  // Demo unit: pablo
  let unit = await Unit.findOne({ name: 'pablo' });
  if (!unit) {
    unit = await Unit.create({ name: 'pablo', city: 'Nagpur' });
    console.log('Created unit: pablo');
  }

  const deptByName = {};
  for (const dm of DEPARTMENT_MASTER) {
    let dept = await Department.findOne({ unit: unit._id, name: dm.name });
    if (!dept) {
      dept = await Department.create({ unit: unit._id, name: dm.name, hasMinMax: dm.hasMinMax });
      let i = 0;
      for (const c of dm.categories) {
        await Category.create({ department: dept._id, name: c, sortOrder: i++ });
      }
      console.log(`Created department ${dm.name} with ${dm.categories.length} categories`);
    }
    deptByName[dm.name] = dept;
  }

  // Items for min-max departments
  for (const [catName, items] of Object.entries(DEMO_ITEMS)) {
    const cat = await Category.findOne({
      name: catName,
      department: { $in: [deptByName['Main Kitchen']._id, deptByName['Bar']._id] },
    });
    if (!cat) continue;
    for (const [name, uom] of items) {
      if (!(await Item.findOne({ category: cat._id, name }))) {
        await Item.create({ category: cat._id, name, uom, isPosLinked: true });
      }
    }
  }
  console.log('Seeded demo items');

  // Demo users for pablo
  const demoUsers = [
    ['Unit Head Pablo', 'unithead.pablo@cph.local', 'unit_head', null, 'unit123'],
    ['Kitchen Head Pablo', 'kitchen.pablo@cph.local', 'dept_head', 'Main Kitchen', 'kitchen123'],
    ['Bar Head Pablo', 'bar.pablo@cph.local', 'dept_head', 'Bar', 'bar123'],
    ['HK Head Pablo', 'hk.pablo@cph.local', 'dept_head', 'HouseKeeping & Maintenance', 'hk123'],
  ];
  for (const [name, email, role, deptName, password] of demoUsers) {
    if (!(await User.findOne({ email }))) {
      await User.create({
        name,
        email,
        role,
        unit: unit._id,
        department: deptName ? deptByName[deptName]._id : null,
        passwordHash: await bcrypt.hash(password, 10),
      });
      console.log(`Created ${email} / ${password}`);
    }
  }

  // Sample POS min-max Excel files to import on the DPR screen
  const samples = writeSampleFiles();
  console.log('Sample POS files written:', samples.join(', '));

  console.log('\nSeed complete. Logins:');
  console.log('  admin@cph.local / admin123           (Admin)');
  console.log('  unithead.pablo@cph.local / unit123   (Unit Head — pablo)');
  console.log('  kitchen.pablo@cph.local / kitchen123 (Dept Head — Main Kitchen)');
  console.log('  bar.pablo@cph.local / bar123         (Dept Head — Bar)');
  console.log('  hk.pablo@cph.local / hk123           (Dept Head — HouseKeeping)');
  console.log('  purchase@cph.local / purchase123     (Purchase Head)');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
