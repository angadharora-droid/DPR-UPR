import mongoose from 'mongoose';

const unitSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    city: { type: String, trim: true, default: '' },
    active: { type: Boolean, default: true },
    // Per-unit sender mailbox for UPR emails; empty = use the group default (env SMTP_USER).
    smtpUser: { type: String, trim: true, lowercase: true, default: '' },
    smtpPass: { type: String, default: '', select: false },
  },
  { timestamps: true }
);

export default mongoose.model('Unit', unitSchema);
