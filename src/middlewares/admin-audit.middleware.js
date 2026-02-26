import logger from "../utils/logger.js";
import {
  recordAdminAuditLog,
  sanitizeAuditPayload,
} from "../modules/observability/services/observability.service.js";
import { patchJsonResponseCapture } from "../utils/responseCapture.js";

const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

const shouldAuditReads = () => process.env.ADMIN_AUDIT_INCLUDE_READS === "true";

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

export const adminAuditMiddleware = (req, res, next) => {
  if (!req.originalUrl?.startsWith("/api/admin")) {
    return next();
  }

  const isWrite = WRITE_METHODS.has(req.method.toUpperCase());
  if (!isWrite && !shouldAuditReads()) {
    return next();
  }

  patchJsonResponseCapture(res);

  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const responseBody = res.locals?.responseBody || null;
    const statusCode = res.statusCode || 0;

    const payload = {
      requestId: req.requestId || "",
      actorId: req.user?.id || null,
      actorRole: req.user?.role || "",
      actionType: isWrite ? "WRITE" : "READ",
      method: req.method,
      path: req.originalUrl?.split("?")[0] || req.path || "",
      routeKey: resolveRouteKey(req),
      params: sanitizeAuditPayload(req.params || {}),
      query: sanitizeAuditPayload(req.query || {}),
      body: sanitizeAuditPayload(req.body || {}),
      statusCode,
      success:
        typeof responseBody?.success === "boolean"
          ? responseBody.success
          : statusCode < 400,
      code: typeof responseBody?.code === "string" ? responseBody.code : null,
      message: typeof responseBody?.message === "string" ? responseBody.message : "",
      durationMs: toDurationMs(startedAt),
      ip: req.ip || "",
      userAgent: req.get("user-agent") || "",
    };

    recordAdminAuditLog(payload).catch((err) => {
      logger.warn(
        { err, requestId: req.requestId, routeKey: payload.routeKey },
        "Failed to persist admin audit log"
      );
    });
  });

  return next();
};
