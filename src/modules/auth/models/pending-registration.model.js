import mongoose from "mongoose";

const pendingRegistrationSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
    firstName: { type: String, default: "", trim: true },
    lastName: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    preferredLanguage: { type: String, enum: ["en", "ka"], default: "en" },
    dateOfBirth: { type: Date, default: null },
    passwordHash: { type: String, required: true, select: false },

    agreementAcceptance: {
      version: { type: String, default: "", trim: true },
      acceptedAt: { type: Date, default: null },
      ip: { type: String, default: "", trim: true, select: false },
      userAgent: { type: String, default: "", trim: true, select: false },
    },

    emailVerification: {
      codeHash: { type: String, default: "", select: false },
      expiresAt: { type: Date, default: null, select: false },
      sentAt: { type: Date, default: null, select: false },
      attempts: { type: Number, default: 0, select: false },
    },

    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

pendingRegistrationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("PendingRegistration", pendingRegistrationSchema);
