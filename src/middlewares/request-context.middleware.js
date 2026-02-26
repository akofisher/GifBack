import { randomUUID } from "node:crypto";

import logger from "../utils/logger.js";

const MAX_REQUEST_ID_LENGTH = 128;

const normalizeRequestId = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_REQUEST_ID_LENGTH);
};

export const requestContextMiddleware = (req, res, next) => {
  const incomingRequestId = normalizeRequestId(req.headers["x-request-id"]);
  const requestId = incomingRequestId || randomUUID();

  req.requestId = requestId;
  req.requestStartedAt = process.hrtime.bigint();
  req.log = logger.child({
    requestId,
    method: req.method,
    path: req.originalUrl,
  });

  res.setHeader("x-request-id", requestId);
  next();
};
