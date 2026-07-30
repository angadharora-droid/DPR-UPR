import mongoose from 'mongoose';

export const ROLES = ['admin', 'unit_head', 'dept_head', 'purchase_head'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true, default: '' },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true },
    unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', default: null },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    active: { type: Boolean, default: true },
    lastLogin: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);
