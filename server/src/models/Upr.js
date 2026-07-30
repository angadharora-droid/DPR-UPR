import mongoose from 'mongoose';

const uprLineSchema = new mongoose.Schema(
  {
    dpr: { type: mongoose.Schema.Types.ObjectId, ref: 'Dpr', default: null },
    dprLineId: { type: mongoose.Schema.Types.ObjectId, default: null },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    departmentName: { type: String, default: '' },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    categoryName: { type: String, default: '' },
    itemName: { type: String, required: true, trim: true },
    uom: { type: String, trim: true, default: '' },
    closingStock: { type: Number, default: null },
    bufferDays: { type: Number, default: null },
    requiredQty: { type: Number, default: 0 },
    remark: { type: String, trim: true, default: '' },
  },
  { _id: true }
);

const uprSchema = new mongoose.Schema(
  {
    unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    cycleDate: { type: String, required: true, index: true },
    status: { type: String, enum: ['draft', 'verified', 'sent'], default: 'draft' },
    verifiedAt: { type: Date, default: null },
    verifiedSignName: { type: String, default: '' },
    sentAt: { type: Date, default: null },
    sentToEmail: { type: String, default: '' },
    pdfPath: { type: String, default: '' },
    dprs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Dpr' }],
    lines: [uprLineSchema],
  },
  { timestamps: true }
);

uprSchema.index({ unit: 1, cycleDate: 1 }, { unique: true });

export default mongoose.model('Upr', uprSchema);
