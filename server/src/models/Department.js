import mongoose from 'mongoose';

const departmentSchema = new mongoose.Schema(
  {
    unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true, index: true },
    name: { type: String, required: true, trim: true },
    hasMinMax: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

departmentSchema.index({ unit: 1, name: 1 }, { unique: true });

export default mongoose.model('Department', departmentSchema);
