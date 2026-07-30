import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema(
  {
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    name: { type: String, required: true, trim: true },
    uom: { type: String, required: true, trim: true },
    isPosLinked: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

itemSchema.index({ category: 1, name: 1 }, { unique: true });

export default mongoose.model('Item', itemSchema);
