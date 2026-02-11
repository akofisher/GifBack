import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../user/user.model.js";
import Session from "./session.model.js";
import { badRequest, conflict, forbidden, notFound, unauthorized } from "../../utils/appError.js";

const ACCESS_TTL = process.env.ACCESS_TOKEN_TTL || "15m";
const REFRESH_TTL = process.env.REFRESH_TOKEN_TTL || "365d";

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const signAccessToken = (user) =>
  jwt.sign(
    { id: user._id.toString(), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );

const signRefreshToken = (user, sessionId) =>
  jwt.sign(
    { id: user._id.toString(), sid: sessionId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TTL }
  );

const refreshExpiresAt = () => {
  const days = Number(process.env.REFRESH_COOKIE_DAYS || 365);
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
};

const toSafeUser = (user) => ({
  _id: user._id.toString(),
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  phone: user.phone,
  role: user.role,
  isActive: user.isActive,
  avatar: user.avatar,
  stats: user.stats,
  dateOfBirth: user.dateOfBirth,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

/**
 * ✅ IMPORTANT:
 * We assume Session schema has:
 * revokedAt: { type: Date, default: null }
 *
 * So an "active" session always means:
 * revokedAt === null AND expiresAt > now
 */

const revokeOtherSessionsForDevice = async (userId, deviceId) => {
  const now = new Date();

  await Session.updateMany(
    {
      userId,
      deviceId,
      revokedAt: null,          // ✅ FIXED (was $exists:false)
      expiresAt: { $gt: now },
    },
    { $set: { revokedAt: new Date() } }
  );
};

// ✅ LOGIN
export const loginUser = async ({
  email,
  password,
  deviceId,
  userAgent = "",
  ip = "",
}) => {
  const user = await User.findOne({
    email: email.toLowerCase().trim(),
  }).select("+password");

  if (!user) {
    throw unauthorized("Invalid email or password", "INVALID_CREDENTIALS");
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    throw unauthorized("Invalid email or password", "INVALID_CREDENTIALS");
  }

  if (!deviceId) {
    throw badRequest("deviceId is required", "MISSING_DEVICE_ID");
  }

  if (user.isActive === false) {
    throw forbidden("User is inactive", "USER_INACTIVE");
  }

  // ✅ ensure ONLY 1 active session per (user + deviceId)
  await revokeOtherSessionsForDevice(user._id, deviceId);

  // create the fresh session
  const session = await Session.create({
    userId: user._id,
    refreshTokenHash: "temp",
    deviceId,
    userAgent,
    ip,
    expiresAt: refreshExpiresAt(),
    lastUsedAt: new Date(),
    revokedAt: null, // ✅ ensure consistency
  });

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user, session._id.toString());

  session.refreshTokenHash = hashToken(refreshToken);
  await session.save();

  return { accessToken, refreshToken, safeUser: toSafeUser(user) };
};

// ✅ REGISTER
export const registerUser = async ({
  firstName,
  lastName,
  phone,
  dateOfBirth,
  email,
  password,
  deviceId,
  userAgent = "",
  ip = "",
}) => {
  if (!deviceId) {
    throw badRequest("deviceId is required", "MISSING_DEVICE_ID");
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedPhone = typeof phone === "string" ? phone.trim() : "";

  const conflicts = [];
  if (await User.exists({ email: normalizedEmail })) {
    conflicts.push({ field: "email", message: "Email already in use" });
  }
  if (normalizedPhone && (await User.exists({ phone: normalizedPhone }))) {
    conflicts.push({ field: "phone", message: "Phone already in use" });
  }
  if (conflicts.length) {
    const message =
      conflicts.length === 1
        ? conflicts[0].message
        : "Email and phone already in use";
    throw conflict(message, "DUPLICATE_CREDENTIALS", conflicts);
  }

  const hashed = await bcrypt.hash(password, 12);

  const user = await User.create({
    firstName,
    lastName,
    phone: normalizedPhone || undefined,
    // ✅ if you send ISO date string, mongoose will cast
    dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
    email: normalizedEmail,
    password: hashed,
    role: "user",
    isActive: true,
  });

  // ✅ ensure only 1 active session for same device
  await revokeOtherSessionsForDevice(user._id, deviceId);

  const session = await Session.create({
    userId: user._id,
    refreshTokenHash: "temp",
    deviceId,
    userAgent,
    ip,
    expiresAt: refreshExpiresAt(),
    lastUsedAt: new Date(),
    revokedAt: null,
  });

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user, session._id.toString());

  session.refreshTokenHash = hashToken(refreshToken);
  await session.save();

  return { safeUser: toSafeUser(user), accessToken, refreshToken };
};

// ✅ REFRESH with rotation
export const refreshAccessToken = async (refreshToken) => {
  if (!refreshToken) {
    throw unauthorized("No refresh token", "MISSING_REFRESH_TOKEN");
  }

  let payload;
  try {
    payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw unauthorized("Invalid refresh token", "INVALID_REFRESH_TOKEN");
  }

  const userId = payload?.id;
  const sessionId = payload?.sid;

  if (!userId || !sessionId) {
    throw unauthorized("Invalid refresh token", "INVALID_REFRESH_TOKEN");
  }

  const session = await Session.findById(sessionId);
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw unauthorized("Session expired", "SESSION_EXPIRED");
  }

  const incomingHash = hashToken(refreshToken);
  if (incomingHash !== session.refreshTokenHash) {
    session.revokedAt = new Date();
    await session.save();

    throw unauthorized("Refresh token invalidated", "REFRESH_TOKEN_REUSED");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw unauthorized("User not found", "USER_NOT_FOUND");
  }
  if (user.isActive === false) {
    throw forbidden("User is inactive", "USER_INACTIVE");
  }

  const newAccessToken = signAccessToken(user);
  const newRefreshToken = signRefreshToken(user, session._id.toString());

  session.refreshTokenHash = hashToken(newRefreshToken);
  session.lastUsedAt = new Date();
  await session.save();

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
};

// ✅ LOGOUT (revoke current session)
export const revokeSession = async (refreshToken) => {
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const sessionId = payload.sid;
    if (!sessionId) return;

    await Session.findByIdAndUpdate(sessionId, { revokedAt: new Date() });
  } catch {
    // ignore
  }
};

export const listUserSessions = async (userId) => {
  const now = new Date();

  const sessions = await Session.find({
    userId,
    revokedAt: null,          // ✅ consistent
    expiresAt: { $gt: now },
  })
    .sort({ lastUsedAt: -1, createdAt: -1 })
    .lean();

  return sessions.map((s) => ({
    id: s._id.toString(),
    deviceId: s.deviceId || "",
    ip: s.ip || "",
    userAgent: s.userAgent || "",
    createdAt: s.createdAt,
    lastUsedAt: s.lastUsedAt,
    expiresAt: s.expiresAt,
  }));
};

export const revokeUserSessionById = async (userId, sessionId) => {
  const session = await Session.findOne({ _id: sessionId, userId });
  if (!session) {
    throw notFound("Session not found", "SESSION_NOT_FOUND");
  }
  if (!session.revokedAt) {
    session.revokedAt = new Date();
    await session.save();
  }
  return { revoked: true };
};

export const revokeAllUserSessions = async (userId) => {
  await Session.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
};
