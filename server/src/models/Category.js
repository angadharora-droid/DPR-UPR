import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    name: { type: String, required: true, trim: true },
    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

categorySchema.index({ department: 1, name: 1 }, { unique: true });

export default mongoose.model('Category', categorySchema);
