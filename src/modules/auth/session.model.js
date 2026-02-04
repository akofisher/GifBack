import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // store hash, never store raw refresh token
    refreshTokenHash: { type: String, required: true },

    // optional metadata
    deviceId: { type: String, default: "default" },
    userAgent: { type: String, default: "" },
    ip: { type: String, default: "" },

    expiresAt: { type: Date, required: true },
   revokedAt: { type: Date, default: null },


    lastUsedAt: { type: Date, default: null },
    createdAt: { type: Date, default: null },
    updatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

sessionSchema.index({ userId: 1, refreshTokenHash: 1 });
sessionSchema.index({ expiresAt: 1 },  { expireAfterSeconds: 0 }); // optional

export default mongoose.model("Session", sessionSchema);
