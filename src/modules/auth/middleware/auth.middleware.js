import jwt from "jsonwebtoken";
import { unauthorized } from "../../../utils/appError.js";
import Session from "../models/session.model.js";

const ensureSessionActive = async (payload) => {
  if (!payload?.sid) return;

  const session = await Session.findById(payload.sid).select(
    "userId revokedAt expiresAt"
  );

  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    throw unauthorized("Session expired", "SESSION_EXPIRED");
  }

  if (session.userId.toString() !== payload.id?.toString()) {
    throw unauthorized("Invalid token", "INVALID_TOKEN");
  }
};

export const requireAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return next(unauthorized("Missing token", "MISSING_TOKEN"));

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    await ensureSessionActive(payload);
    req.user = {
      id: payload.id,
      role: payload.role,
      sid: payload.sid || null,
      lang: payload.lang || "en",
    };
    next();
  } catch (err) {
    next(err);
  }
};

export const optionalAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return next();
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    await ensureSessionActive(payload);
    req.user = {
      id: payload.id,
      role: payload.role,
      sid: payload.sid || null,
      lang: payload.lang || "en",
    };

    return next();
  } catch (_err) {
    return next();
  }
};

export const protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return next(unauthorized("Missing token", "MISSING_TOKEN"));
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    await ensureSessionActive(payload);
    req.user = { ...payload, lang: payload.lang || "en" }; // { id, role, sid?, lang? }
    next();
  } catch (err) {
    return next(err);
  }
};
