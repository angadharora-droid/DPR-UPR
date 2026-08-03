import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import Unit from './models/Unit.js';
import Department from './models/Department.js';
import Category from './models/Category.js';
import Item from './models/Item.js';
import RawMaterial from './models/RawMaterial.js';
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
      [Unit, Department, Category, Item, RawMaterial, User, MinMaxReport, Dpr, Upr, AuditLog].map((m) => m.deleteMany({}))
    );
    console.log('Wiped existing data');
  }

  // Backfill loginId for users seeded before the field existed
  async function ensureLoginId(user, loginId) {
    if (user && !user.loginId) {
      user.loginId = loginId;
      await user.save();
      console.log(`Set login ID "${loginId}" on ${user.email}`);
    }
  }

  // Admin
  let admin = await User.findOne({ email: 'admin@cph.local' });
  if (!admin) {
    admin = await User.create({
      name: 'Group Admin',
      email: 'admin@cph.local',
      loginId: 'admin',
      role: 'admin',
      passwordHash: await bcrypt.hash('admin123', 10),
    });
    console.log('Created admin@cph.local / admin123');
  }
  await ensureLoginId(admin, 'admin');

  // Purchase Head (central, one for the whole group)
  let purchase = await User.findOne({ email: 'purchase@cph.local' });
  if (!purchase) {
    purchase = await User.create({
      name: 'Purchase Head',
      email: 'purchase@cph.local',
      loginId: 'purchase',
      role: 'purchase_head',
      passwordHash: await bcrypt.hash('purchase123', 10),
    });
    console.log('Created purchase@cph.local / purchase123');
  }
  await ensureLoginId(purchase, 'purchase');

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
    ['Unit Head Pablo', 'unithead.pablo@cph.local', 'unithead.pablo', 'unit_head', null, 'unit123'],
    ['Kitchen Head Pablo', 'kitchen.pablo@cph.local', 'kitchen.pablo', 'dept_head', 'Main Kitchen', 'kitchen123'],
    ['Bar Head Pablo', 'bar.pablo@cph.local', 'bar.pablo', 'dept_head', 'Bar', 'bar123'],
    ['HK Head Pablo', 'hk.pablo@cph.local', 'hk.pablo', 'dept_head', 'HouseKeeping & Maintenance', 'hk123'],
  ];
  for (const [name, email, loginId, role, deptName, password] of demoUsers) {
    const existing = await User.findOne({ email });
    if (!existing) {
      await User.create({
        name,
        email,
        loginId,
        role,
        unit: unit._id,
        department: deptName ? deptByName[deptName]._id : null,
        passwordHash: await bcrypt.hash(password, 10),
      });
      console.log(`Created ${email} / ${password}`);
    } else {
      await ensureLoginId(existing, loginId);
    }
  }

  // Sample POS min-max Excel files to import on the DPR screen
  const samples = writeSampleFiles();
  console.log('Sample POS files written:', samples.join(', '));

  console.log('\nSeed complete. Logins (login ID or email both work):');
  console.log('  admin / admin123            (Admin)');
  console.log('  unithead.pablo / unit123    (Unit Head — pablo)');
  console.log('  kitchen.pablo / kitchen123  (Dept Head — Main Kitchen)');
  console.log('  bar.pablo / bar123          (Dept Head — Bar)');
  console.log('  hk.pablo / hk123            (Dept Head — HouseKeeping)');
  console.log('  purchase / purchase123      (Purchase Head)');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
