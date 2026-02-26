import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import Session from "../../auth/models/session.model.js"; // if you have sessions collection
import User from "../models/user.model.js";
import { normalizeLanguage } from "../../../i18n/localization.js";
import { badRequest, conflict, notFound, unauthorized } from "../../../utils/appError.js";
import { getRolePermissions, normalizeRole } from "../../admin/rbac/rbac.js";

const toSafeUser = (u) => ({
  _id: u._id.toString(),
  firstName: u.firstName,
  lastName: u.lastName,
  email: u.email,
  emailVerified: Boolean(u.emailVerified),
  phone: u.phone,
  preferredLanguage: normalizeLanguage(u.preferredLanguage),
  dateOfBirth: u.dateOfBirth,
  role: normalizeRole(u.role),
  permissions: getRolePermissions(u.role),
  isActive: u.isActive,
  avatar: u.avatar,
  stats: u.stats,
  agreementAcceptance: {
    version: u.agreementAcceptance?.version || "",
    acceptedAt: u.agreementAcceptance?.acceptedAt || null,
  },
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
});

const ACCESS_TTL = process.env.ACCESS_TOKEN_TTL || "15m";
const REFRESH_TTL = process.env.REFRESH_TOKEN_TTL || "365d";
const parsedRefreshCookieDays = Number(process.env.REFRESH_COOKIE_DAYS);
const REFRESH_COOKIE_DAYS =
  Number.isFinite(parsedRefreshCookieDays) && parsedRefreshCookieDays > 0
    ? parsedRefreshCookieDays
    : 365;

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const signAccessToken = (user, sessionId = null) =>
  jwt.sign(
    {
      id: user._id.toString(),
      role: user.role,
      lang: normalizeLanguage(user.preferredLanguage),
      ...(sessionId ? { sid: sessionId.toString() } : {}),
    },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );

const signRefreshToken = (user, sessionId) =>
  jwt.sign(
    { id: user._id.toString(), sid: sessionId.toString() },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TTL }
  );

const refreshExpiresAt = (now = Date.now()) =>
  new Date(now + REFRESH_COOKIE_DAYS * 24 * 60 * 60 * 1000);

// ✅ existing
export const getUsersPreview = async () => {
  return User.find().limit(20).lean();
};

export const getMe = async (id) => {
  const user = await User.findById(id).select("-password").lean();
  if (!user) return null;
  return toSafeUser(user);
};

/**
 * ✅ Update current user profile
 * Requires currentPassword (simple & secure rule).
 */
export const updateMe = async (userId, payload) => {
  const user = await User.findById(userId).select("+password");
  if (!user) {
    throw notFound("User not found", "USER_NOT_FOUND");
  }

  if (!payload.currentPassword) {
    throw badRequest("Current password is required", "MISSING_CURRENT_PASSWORD");
  }

  const ok = await bcrypt.compare(payload.currentPassword, user.password);
  if (!ok) {
    throw unauthorized("Wrong password", "INVALID_PASSWORD");
  }

  // ✅ allowlist updates (only what you want editable)
  if (typeof payload.firstName === "string") user.firstName = payload.firstName.trim();
  if (typeof payload.lastName === "string") user.lastName = payload.lastName.trim();
  if (payload.preferredLanguage !== undefined) {
    const normalizedPreferredLanguage = normalizeLanguage(
      payload.preferredLanguage,
      ""
    );
    if (!normalizedPreferredLanguage) {
      throw badRequest("Validation error", "VALIDATION_ERROR", [
        {
          field: "preferredLanguage",
          message: "preferredLanguage must be en or ka",
        },
      ]);
    }
    user.preferredLanguage = normalizedPreferredLanguage;
  }
  if (typeof payload.phone === "string") {
    const nextPhone = payload.phone.trim();
    if (nextPhone && nextPhone !== (user.phone || "")) {
      const exists = await User.exists({
        phone: nextPhone,
        _id: { $ne: userId },
      });
      if (exists) {
        throw conflict("Phone already in use", "PHONE_TAKEN", [
          { field: "phone" },
        ]);
      }
    }
    user.phone = nextPhone;
  }

  if (typeof payload.dateOfBirth === "string" && payload.dateOfBirth.trim()) {
    // expects "YYYY-MM-DD"
    user.dateOfBirth = new Date(payload.dateOfBirth + "T00:00:00.000Z");
  }

  // avatar: url and/or base64
  if (payload.avatar?.url !== undefined) {
    user.avatar = user.avatar || {};
    user.avatar.url = payload.avatar.url || "";
  }
  if (payload.avatar?.base64 !== undefined) {
    user.avatar = user.avatar || {};
    user.avatar.base64 = payload.avatar.base64 || "";
  }

  await user.save();

  const fresh = await User.findById(userId).lean();
  return toSafeUser(fresh);
};

export const changeMyPassword = async (
  userId,
  currentPassword,
  newPassword,
  repeatPassword,
  currentSessionId = null
) => {
  const user = await User.findById(userId).select("+password");
  if (!user) {
    throw notFound("User not found", "USER_NOT_FOUND");
  }

  const ok = await bcrypt.compare(currentPassword, user.password);
  if (!ok) {
    throw unauthorized("Wrong password", "INVALID_PASSWORD");
  }

  if (newPassword !== repeatPassword) {
    throw badRequest("Passwords do not match", "PASSWORD_CONFIRM_MISMATCH");
  }

  if (newPassword.length < 6) {
    throw badRequest("Password must be at least 6 characters", "PASSWORD_TOO_SHORT");
  }

  const sameAsOld = await bcrypt.compare(newPassword, user.password);
  if (sameAsOld) {
    throw conflict(
      "New password must be different from current password",
      "PASSWORD_SAME_AS_OLD"
    );
  }

  user.password = await bcrypt.hash(newPassword, 12);
  await user.save();

  const now = new Date();

  let currentSession = null;
  if (currentSessionId) {
    currentSession = await Session.findOne({
      _id: currentSessionId,
      userId,
      revokedAt: null,
      expiresAt: { $gt: now },
    });
  }

  // If request token has no active sid context, create a replacement session
  // so the current device remains logged in after password change.
  if (!currentSession) {
    currentSession = await Session.create({
      userId,
      refreshTokenHash: "temp",
      deviceId: "password-change",
      userAgent: "",
      ip: "",
      expiresAt: refreshExpiresAt(now.getTime()),
      lastUsedAt: now,
      revokedAt: null,
    });
  }

  await Session.updateMany(
    {
      userId,
      revokedAt: null,
      _id: { $ne: currentSession._id },
    },
    { $set: { revokedAt: now } }
  );

  const refreshToken = signRefreshToken(user, currentSession._id);
  currentSession.refreshTokenHash = hashToken(refreshToken);
  currentSession.expiresAt = refreshExpiresAt(now.getTime());
  currentSession.lastUsedAt = now;
  currentSession.revokedAt = null;
  await currentSession.save();

  const accessToken = signAccessToken(user, currentSession._id);

  return {
    changed: true,
    accessToken,
    refreshToken,
  };
};

/**
 * ✅ Delete account (requires password)
 * Revokes sessions + deletes user.
 */
export const deleteMe = async (userId, currentPassword) => {
  const user = await User.findById(userId).select("+password");
  if (!user) {
    throw notFound("User not found", "USER_NOT_FOUND");
  }

  const ok = await bcrypt.compare(currentPassword, user.password);
  if (!ok) {
    throw unauthorized("Wrong password", "INVALID_PASSWORD");
  }

  if (Session) {
    await Session.updateMany({ userId }, { $set: { revokedAt: new Date() } });
  }

  await User.deleteOne({ _id: userId });

  return { deleted: true };
};

const buildName = (firstName, lastName) =>
  [firstName, lastName].filter(Boolean).join(" ").trim();

export const getTopGivenLeaderboard = async (limit = 100, options = {}) => {
  const normalizedLimit = Math.min(Math.max(Number(limit) || 100, 1), 100);
  const includeContacts = Boolean(options.includeContacts);

  const users = await User.find({ role: "user", isActive: true })
    .sort({ "stats.given": -1, _id: 1 })
    .limit(normalizedLimit)
    .select(
      includeContacts
        ? "firstName lastName avatar stats email phone"
        : "firstName lastName avatar stats"
    )
    .lean();

  const leaderboard = users.map((user, index) => {
    const given = Number(user?.stats?.given || 0);
    const exchanged = Number(user?.stats?.exchanged || 0);
    const name = buildName(user.firstName, user.lastName);

    return {
      rank: index + 1,
      user: {
        _id: user._id.toString(),
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        name,
        avatar: user.avatar || null,
        ...(includeContacts
          ? {
              email: user.email || null,
              phoneNumber: user.phone || user.phoneNumber || null,
            }
          : {}),
      },
      stats: {
        given,
        exchanged,
      },
    };
  });

  return {
    items: leaderboard,
    pagination: {
      page: 1,
      limit: normalizedLimit,
      total: leaderboard.length,
      pages: 1,
    },
  };
};
