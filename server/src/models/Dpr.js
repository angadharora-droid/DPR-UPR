import mongoose from 'mongoose';

const dprLineSchema = new mongoose.Schema(
  {
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
    itemNameOverride: { type: String, trim: true, default: '' },
    uom: { type: String, trim: true, default: '' },
    closingStock: { type: Number, default: null },
    bufferDays: { type: Number, default: null },
    minMaxSuggestedQty: { type: Number, default: null },
    requiredQty: { type: Number, default: 0 },
    remark: { type: String, trim: true, default: '' },
    isManuallyAdded: { type: Boolean, default: false },
  },
  { _id: true }
);

const dprSchema = new mongoose.Schema(
  {
    unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true, index: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // one DPR per department per day (cycleDate = YYYY-MM-DD)
    cycleDate: { type: String, required: true, index: true },
    status: { type: String, enum: ['draft', 'submitted'], default: 'draft' },
    hodSignName: { type: String, default: '' },
    hodSignDate: { type: Date, default: null },
    minMaxReport: { type: mongoose.Schema.Types.ObjectId, ref: 'MinMaxReport', default: null },
    lines: [dprLineSchema],
  },
  { timestamps: true }
);

dprSchema.index({ unit: 1, department: 1, cycleDate: 1 }, { unique: true });

export default mongoose.model('Dpr', dprSchema);
