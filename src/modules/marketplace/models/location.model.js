import mongoose from "mongoose";

const citySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    nameTranslations: { type: Map, of: String, default: {} },
    localName: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { _id: true }
);

const locationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    nameTranslations: { type: Map, of: String, default: {} },
    localName: { type: String, default: "", trim: true },
    code: { type: String, required: true, trim: true, uppercase: true, unique: true },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    cities: { type: [citySchema], default: [] },
  },
  { timestamps: true }
);

locationSchema.index({ order: 1, name: 1 });
locationSchema.index({ isActive: 1, order: 1, name: 1 });

export default mongoose.model("Location", locationSchema);
