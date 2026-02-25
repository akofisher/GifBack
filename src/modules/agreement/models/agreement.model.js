import mongoose from "mongoose";

const agreementSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "USER_REGISTRATION_AGREEMENT",
      trim: true,
    },
    version: { type: String, required: true, trim: true, default: "1.0.0" },
    title: { type: String, required: true, trim: true, default: "User Agreement" },
    content: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

agreementSchema.index({ isActive: 1, updatedAt: -1 });

export default mongoose.model("Agreement", agreementSchema);
