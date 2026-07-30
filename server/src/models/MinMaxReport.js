import mongoose from 'mongoose';

const minMaxLineSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    closingStock: { type: Number, default: 0 },
    bufferDays: { type: Number, default: 0 },
    systemRequiredQty: { type: Number, default: 0 },
  },
  { _id: true }
);

const minMaxReportSchema = new mongoose.Schema(
  {
    unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true, index: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    reportDate: { type: Date, required: true },
    source: { type: String, default: 'csv-upload' },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lines: [minMaxLineSchema],
  },
  { timestamps: true }
);

export default mongoose.model('MinMaxReport', minMaxReportSchema);
