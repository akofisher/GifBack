import mongoose from "mongoose";

const pushTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    deviceId: {
      type: String,
      required: true,
      trim: true,
    },
    token: {
      type: String,
      required: true,
      trim: true,
    },
    platform: {
      type: String,
      enum: ["android", "ios", "web", "unknown"],
      default: "unknown",
      index: true,
    },
    appVersion: {
      type: String,
      default: "",
      trim: true,
    },
    locale: {
      type: String,
      default: "",
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastSeenAt: {
      type: Date,
      default: null,
    },
    invalidatedAt: {
      type: Date,
      default: null,
    },
    lastErrorCode: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

pushTokenSchema.index({ userId: 1, deviceId: 1 }, { unique: true });
pushTokenSchema.index({ token: 1 });
pushTokenSchema.index({ userId: 1, isActive: 1, lastSeenAt: -1, _id: 1 });
pushTokenSchema.index({ isActive: 1, updatedAt: -1 });

export default mongoose.model("PushToken", pushTokenSchema);
