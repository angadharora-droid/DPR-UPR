import mongoose from 'mongoose';

const unitSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    city: { type: String, trim: true, default: '' },
    active: { type: Boolean, default: true },
    // Per-unit sender mailbox for UPR emails; empty = use the group default (env SMTP_USER).
    smtpUser: { type: String, trim: true, lowercase: true, default: '' },
    smtpPass: { type: String, default: '', select: false },
    // Raw-material catalog summary (the materials themselves live in RawMaterial).
    rawMaterialCount: { type: Number, default: 0 },
    rawMaterialsUpdatedAt: { type: Date, default: null },
    rawMaterialsSource: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('Unit', unitSchema);
