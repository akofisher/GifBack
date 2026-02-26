import mongoose from "mongoose";

const adminAuditLogSchema = new mongoose.Schema(
  {
    requestId: { type: String, required: true, index: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    actorRole: { type: String, default: "", index: true },

    actionType: { type: String, enum: ["READ", "WRITE"], required: true, index: true },
    method: { type: String, required: true, index: true },
    path: { type: String, required: true },
    routeKey: { type: String, required: true, index: true },

    params: { type: mongoose.Schema.Types.Mixed, default: {} },
    query: { type: mongoose.Schema.Types.Mixed, default: {} },
    body: { type: mongoose.Schema.Types.Mixed, default: {} },

    statusCode: { type: Number, required: true, index: true },
    success: { type: Boolean, required: true, index: true },
    code: { type: String, default: null, index: true },
    message: { type: String, default: "" },

    durationMs: { type: Number, required: true },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

adminAuditLogSchema.index({ createdAt: -1 });
adminAuditLogSchema.index({ actorId: 1, createdAt: -1 });
adminAuditLogSchema.index({ requestId: 1, createdAt: -1 });
adminAuditLogSchema.index({ method: 1, createdAt: -1 });
adminAuditLogSchema.index({ actionType: 1, createdAt: -1 });
adminAuditLogSchema.index({ statusCode: 1, createdAt: -1 });
adminAuditLogSchema.index({ routeKey: 1, createdAt: -1 });

export default mongoose.model("AdminAuditLog", adminAuditLogSchema);
