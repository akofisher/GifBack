import mongoose from "mongoose";

const donationMethodSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    labelTranslations: { type: Map, of: String, default: {} },
    accountNumber: { type: String, trim: true },
    link: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { _id: true }
);

const donationSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "DONATION_SETTINGS",
      trim: true,
    },
    methods: { type: [donationMethodSchema], default: [] },
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

donationSchema.index({ updatedAt: -1 });

export default mongoose.model("Donation", donationSchema);
