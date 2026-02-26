import ApiRequestMetric from "../modules/observability/models/api-request-metric.model.js";
import logger from "../utils/logger.js";
import { patchJsonResponseCapture } from "../utils/responseCapture.js";

const isEnabled = () => process.env.REQUEST_METRICS_ENABLED !== "false";

const resolveRouteKey = (req) => {
  if (req.route?.path) {
    return `${req.baseUrl || ""}${req.route.path}`;
  }

  return req.originalUrl?.split("?")[0] || req.path || "";
};

const toDurationMs = (startedAt) => {
  if (typeof startedAt === "bigint") {
    return Number(process.hrtime.bigint() - startedAt) / 1e6;
  }
  return 0;
};

export const requestMetricsMiddleware = (req, res, next) => {
  if (!isEnabled() || !req.originalUrl?.startsWith("/api")) {
    return next();
  }

  patchJsonResponseCapture(res);

  const startedAt = req.requestStartedAt || process.hrtime.bigint();

  res.on("finish", () => {
    const responseBody = res.locals?.responseBody || null;
    const statusCode = res.statusCode || 0;
    const metric = {
      requestId: req.requestId || "",
      method: req.method,
      path: req.originalUrl?.split("?")[0] || req.path || "",
      routeKey: resolveRouteKey(req),
      statusCode,
      success:
        typeof responseBody?.success === "boolean"
          ? responseBody.success
          : statusCode < 400,
      code: typeof responseBody?.code === "string" ? responseBody.code : null,
      message: typeof responseBody?.message === "string" ? responseBody.message : "",
      durationMs: toDurationMs(startedAt),
      userId: req.user?.id || null,
      userRole: req.user?.role || null,
      ip: req.ip || "",
      userAgent: req.get("user-agent") || "",
    };

    ApiRequestMetric.create(metric).catch((err) => {
      logger.warn(
        { err, requestId: req.requestId, routeKey: metric.routeKey },
        "Failed to persist request metric"
      );
    });
  });

  return next();
};
