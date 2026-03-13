import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },

    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    emailVerified: { type: Boolean, default: false, index: true },
    phone: { type: String, trim: true },

    password: { type: String, required: true, select: false },

    role: { type: String, enum: ["user", "admin", "super_admin"], default: "user" },
    isActive: { type: Boolean, default: true },
    accessBlock: {
      type: {
        type: String,
        enum: ["NONE", "TEMPORARY_14_DAYS", "PERMANENT"],
        default: "NONE",
        index: true,
      },
      until: { type: Date, default: null },
      updatedAt: { type: Date, default: null },
      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
        select: false,
      },
    },
    preferredLanguage: {
      type: String,
      enum: ["en", "ka"],
      default: "en",
    },

    avatar: {
      url: { type: String, default: "https://i.pravatar.cc/300" },
      path: { type: String, default: "" },
      filename: { type: String, default: "" },
      mimeType: { type: String, default: "" },
      size: { type: Number, default: null },
      provider: { type: String, default: "local" },
      publicId: { type: String, default: "" },
      base64: { type: String, default: "" },
    },

   dateOfBirth: { type: Date, default: "" },

    stats: {
      giving: { type: Number, default: 0 },
      exchanging: { type: Number, default: 0 },
      exchanged: { type: Number, default: 0 },
      given: { type: Number, default: 0 },
    },

    emailVerification: {
      codeHash: { type: String, default: "", select: false },
      expiresAt: { type: Date, default: null, select: false },
      sentAt: { type: Date, default: null, select: false },
      attempts: { type: Number, default: 0, select: false },
    },

    passwordReset: {
      codeHash: { type: String, default: "", select: false },
      expiresAt: { type: Date, default: null, select: false },
      sentAt: { type: Date, default: null, select: false },
      attempts: { type: Number, default: 0, select: false },
      resetTokenHash: { type: String, default: "", select: false },
      resetTokenExpiresAt: { type: Date, default: null, select: false },
    },

    agreementAcceptance: {
      version: { type: String, default: "", trim: true },
      acceptedAt: { type: Date, default: null },
      ip: { type: String, default: "", trim: true, select: false },
      userAgent: { type: String, default: "", trim: true, select: false },
    },
  },
  { timestamps: true }
);

userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ isActive: 1, createdAt: -1 });
userSchema.index({ role: 1, isActive: 1, createdAt: -1 });
userSchema.index({ role: 1, isActive: 1, "stats.given": -1, _id: 1 });
userSchema.index({ emailVerified: 1, createdAt: -1 });
userSchema.index({ updatedAt: -1 });
userSchema.index({
  firstName: "text",
  lastName: "text",
  email: "text",
  phone: "text",
});

export default mongoose.model("User", userSchema);
