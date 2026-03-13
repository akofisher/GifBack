import mongoose from "mongoose";

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    path: { type: String, default: "" },
    filename: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    size: { type: Number, default: null },
    provider: { type: String, default: "local" },
    publicId: { type: String, default: "" },
    width: { type: Number },
    height: { type: Number },
  },
  { _id: false }
);

const itemSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true, index: true },
    countryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null,
      index: true,
    },
    cityId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    address: { type: String, trim: true, default: "" },

    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },

    mode: { type: String, enum: ["GIFT", "EXCHANGE"], required: true },
    status: {
      type: String,
      enum: ["ACTIVE", "RESERVED", "COMPLETED", "REMOVED"],
      default: "ACTIVE",
      index: true,
    },

    images: { type: [imageSchema], default: [] },

    pendingRequestsCount: { type: Number, default: 0 },
    reservedByRequestId: { type: mongoose.Schema.Types.ObjectId, ref: "ItemRequest", default: null },
  },
  { timestamps: true }
);

itemSchema.index({ status: 1, mode: 1, createdAt: -1 });
itemSchema.index({ ownerId: 1, createdAt: -1 });
itemSchema.index({ categoryId: 1, createdAt: -1 });
itemSchema.index({ status: 1, updatedAt: -1 });
itemSchema.index({ mode: 1, updatedAt: -1 });
itemSchema.index({ ownerId: 1, status: 1, createdAt: -1 });
itemSchema.index({ categoryId: 1, status: 1, createdAt: -1 });
itemSchema.index({ countryId: 1, cityId: 1, status: 1, createdAt: -1 });
itemSchema.index({ title: "text", description: "text" });

export default mongoose.model("Item", itemSchema);
