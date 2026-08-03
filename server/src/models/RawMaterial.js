import mongoose from 'mongoose';

// Per-unit raw-material catalog imported from the POS raw-material export/report.
// Powers item autocomplete on DPR entry: picking a material fills the item name,
// UOM (purchase unit) and files the line under the matching category.
const rawMaterialSchema = new mongoose.Schema(
  {
    unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true, index: true },
    name: { type: String, required: true, trim: true },
    uom: { type: String, trim: true, default: '' },
    consumptionUnit: { type: String, trim: true, default: '' },
    category: { type: String, trim: true, default: '' },
    subCategory: { type: String, trim: true, default: '' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

rawMaterialSchema.index({ unit: 1, name: 1 });

export default mongoose.model('RawMaterial', rawMaterialSchema);
