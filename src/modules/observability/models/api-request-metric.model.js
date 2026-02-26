import mongoose from "mongoose";

const DEFAULT_TTL_DAYS = 30;

const parseTtlDays = () => {
  const value = Number(process.env.REQUEST_METRICS_TTL_DAYS);
  if (!Number.isInteger(value) || value <= 0) {
    return DEFAULT_TTL_DAYS;
  }
  return value;
};

const requestMetricSchema = new mongoose.Schema(
  {
    requestId: { type: String, required: true, index: true },
    method: { type: String, required: true, index: true },
    path: { type: String, required: true },
    routeKey: { type: String, required: true, index: true },
    statusCode: { type: Number, required: true, index: true },
    success: { type: Boolean, required: true, index: true },
    code: { type: String, default: null, index: true },
    message: { type: String, default: "" },
    durationMs: { type: Number, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    userRole: { type: String, default: null, index: true },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

requestMetricSchema.index({ createdAt: 1 }, { expireAfterSeconds: parseTtlDays() * 24 * 60 * 60 });
requestMetricSchema.index({ routeKey: 1, method: 1, createdAt: -1 });
requestMetricSchema.index({ statusCode: 1, createdAt: -1 });
requestMetricSchema.index({ code: 1, createdAt: -1 });

export default mongoose.model("ApiRequestMetric", requestMetricSchema);
