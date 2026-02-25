import mongoose from "mongoose";

const platformConfigSchema = new mongoose.Schema(
  {
    latestVersion: { type: String, required: true, default: "1.0.0", trim: true },
    minSupportedVersion: {
      type: String,
      required: true,
      default: "1.0.0",
      trim: true,
    },
    storeUrl: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const appVersionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "mobile-app" },
    android: { type: platformConfigSchema, required: true, default: () => ({}) },
    ios: { type: platformConfigSchema, required: true, default: () => ({}) },
    updateMessage: {
      type: String,
      default: "A new app version is available. Please update the app.",
      trim: true,
      maxlength: 300,
    },
    isEnabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("AppVersion", appVersionSchema);
