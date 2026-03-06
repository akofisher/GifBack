import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { normalizeLanguage } from "../../../i18n/localization.js";
import User from "../../user/models/user.model.js";
import Session from "../models/session.model.js";
import PendingRegistration from "../models/pending-registration.model.js";
import {
  validateAgreementAcceptanceForRegistration,
} from "../../agreement/services/agreement.service.js";
import { enforceUserAccessBlock } from "../../user/services/user-block.service.js";
import { AppError, badRequest, conflict, forbidden, notFound, unauthorized } from "../../../utils/appError.js";
import {
  EMAIL_VERIFICATION_REQUIRED,
  EMAIL_VERIFY_MAX_ATTEMPTS,
  EMAIL_VERIFY_RESEND_COOLDOWN_SECONDS,
  PASSWORD_RESET_MAX_ATTEMPTS,
  PASSWORD_RESET_RESEND_COOLDOWN_SECONDS,
  PASSWORD_RESET_SECRET,
  PASSWORD_RESET_TOKEN_TTL_MINUTES,
} from "./auth.config.js";
import {
  getPasswordResetCodeExpiryDate,
  getPasswordResetTokenExpiryDate,
  getPendingRegistrationExpiryDate,
  getVerificationExpiryDate,
  hashPasswordResetCode,
  hashToken,
  hashVerificationCode,
  randomVerificationCode,
  refreshExpiresAt,
  signAccessToken,
  signPasswordResetToken,
  signRefreshToken,
} from "./auth.crypto.js";
import { sendPasswordResetEmail, sendVerificationEmail } from "./auth.email.service.js";
import {
  buildPendingRegistrationPreview,
  toSafeUser,
} from "./auth.presenters.js";

const createSessionForUser = async ({
  user,
  deviceId,
  userAgent = "",
  ip = "",
}) => {
  if (!deviceId) {
    throw badRequest("deviceId is required", "MISSING_DEVICE_ID");
  }

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

  const accessToken = signAccessToken(user, session._id);
  const refreshToken = signRefreshToken(user, session._id.toString());

  session.refreshTokenHash = hashToken(refreshToken);
  await session.save();

  return { accessToken, refreshToken };
};

const issueEmailVerificationCode = async (user, { force = false } = {}) => {
  if (!user) return { sent: false };
  if (user.emailVerified) {
    throw conflict("Email is already verified", "EMAIL_ALREADY_VERIFIED");
  }

  const now = new Date();
  const sentAt = user.emailVerification?.sentAt
    ? new Date(user.emailVerification.sentAt)
    : null;
  const cooldownMs = EMAIL_VERIFY_RESEND_COOLDOWN_SECONDS * 1000;

  if (!force && sentAt && now.getTime() - sentAt.getTime() < cooldownMs) {
    const retryAfterSeconds = Math.ceil(
      (cooldownMs - (now.getTime() - sentAt.getTime())) / 1000
    );
    throw new AppError(
      "Please wait before requesting another code",
      429,
      "EMAIL_VERIFICATION_RESEND_TOO_SOON",
      [{ field: "retryAfterSeconds", message: String(retryAfterSeconds) }]
    );
  }

  const code = randomVerificationCode();
  user.emailVerification = {
    codeHash: hashVerificationCode(user.email, code),
    expiresAt: getVerificationExpiryDate(),
    sentAt: now,
    attempts: 0,
  };
  await user.save();

  await sendVerificationEmail({ to: user.email, code });
  return { sent: true };
};

const issuePendingEmailVerificationCode = async (
  pendingRegistration,
  { force = false } = {}
) => {
  if (!pendingRegistration) return { sent: false };

  const now = new Date();
  const sentAt = pendingRegistration.emailVerification?.sentAt
    ? new Date(pendingRegistration.emailVerification.sentAt)
    : null;
  const cooldownMs = EMAIL_VERIFY_RESEND_COOLDOWN_SECONDS * 1000;

  if (!force && sentAt && now.getTime() - sentAt.getTime() < cooldownMs) {
    const retryAfterSeconds = Math.ceil(
      (cooldownMs - (now.getTime() - sentAt.getTime())) / 1000
    );
    throw new AppError(
      "Please wait before requesting another code",
      429,
      "EMAIL_VERIFICATION_RESEND_TOO_SOON",
      [{ field: "retryAfterSeconds", message: String(retryAfterSeconds) }]
    );
  }

  const code = randomVerificationCode();
  pendingRegistration.emailVerification = {
    codeHash: hashVerificationCode(pendingRegistration.email, code),
    expiresAt: getVerificationExpiryDate(),
    sentAt: now,
    attempts: 0,
  };
  pendingRegistration.expiresAt = getPendingRegistrationExpiryDate();
  await pendingRegistration.save();

  await sendVerificationEmail({ to: pendingRegistration.email, code });
  return { sent: true };
};

const issuePasswordResetCode = async (user, { force = false } = {}) => {
  if (!user) return { sent: false };

  const now = new Date();
  const sentAt = user.passwordReset?.sentAt
    ? new Date(user.passwordReset.sentAt)
    : null;
  const cooldownMs = PASSWORD_RESET_RESEND_COOLDOWN_SECONDS * 1000;

  if (!force && sentAt && now.getTime() - sentAt.getTime() < cooldownMs) {
    const retryAfterSeconds = Math.ceil(
      (cooldownMs - (now.getTime() - sentAt.getTime())) / 1000
    );
    throw new AppError(
      "Please wait before requesting another code",
      429,
      "PASSWORD_RESET_RESEND_TOO_SOON",
      [{ field: "retryAfterSeconds", message: String(retryAfterSeconds) }]
    );
  }

  const code = randomVerificationCode();
  user.passwordReset = {
    codeHash: hashPasswordResetCode(user.email, code),
    expiresAt: getPasswordResetCodeExpiryDate(),
    sentAt: now,
    attempts: 0,
    resetTokenHash: "",
    resetTokenExpiresAt: null,
  };
  await user.save();

  await sendPasswordResetEmail({ to: user.email, code });
  return { sent: true };
};

const revokeOtherSessionsForDevice = async (userId, deviceId) => {
  const now = new Date();

  await Session.deleteMany(
    {
      userId,
      deviceId,
      revokedAt: null,
      expiresAt: { $gt: now },
    }
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
  }).select("+password +emailVerification.codeHash +emailVerification.expiresAt +emailVerification.sentAt +emailVerification.attempts");

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

  await enforceUserAccessBlock(user);
  if (EMAIL_VERIFICATION_REQUIRED && !user.emailVerified) {
    try {
      await issueEmailVerificationCode(user);
    } catch (err) {
      if (err instanceof AppError && err.code === "EMAIL_VERIFICATION_RESEND_TOO_SOON") {
        // ignore cooldown error on auto-send
      } else {
        logger.warn(
          { err, userId: user._id?.toString() },
          "Failed to auto-send verification code on login"
        );
      }
    }

    throw forbidden(
      "Email is not verified. Please verify your email first",
      "EMAIL_NOT_VERIFIED"
    );
  }

  const { accessToken, refreshToken } = await createSessionForUser({
    user,
    deviceId,
    userAgent,
    ip,
  });

  return { accessToken, refreshToken, safeUser: toSafeUser(user) };
};

// ✅ REGISTER
export const registerUser = async ({
  firstName,
  lastName,
  phone,
  preferredLanguage,
  dateOfBirth,
  email,
  password,
  agreementAccepted,
  agreementVersion,
  deviceId,
  userAgent = "",
  ip = "",
}) => {
  if (!deviceId) {
    throw badRequest("deviceId is required", "MISSING_DEVICE_ID");
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedPhone = typeof phone === "string" ? phone.trim() : "";
  const normalizedPreferredLanguage = normalizeLanguage(preferredLanguage);
  const agreementAcceptance = await validateAgreementAcceptanceForRegistration({
    agreementAccepted,
    agreementVersion,
    userAgent,
    ip,
  });

  if (EMAIL_VERIFICATION_REQUIRED) {
    const existingUser = await User.findOne({ email: normalizedEmail })
      .select("_id emailVerified")
      .lean();

    if (existingUser?.emailVerified) {
      throw conflict("Email already in use", "DUPLICATE_CREDENTIALS", [
        { field: "email", message: "Email already in use" },
      ]);
    }

    if (existingUser && !existingUser.emailVerified) {
      await Session.deleteMany({ userId: existingUser._id });
      await User.deleteOne({ _id: existingUser._id });
    }

    const conflicts = [];
    if (normalizedPhone && (await User.exists({ phone: normalizedPhone }))) {
      conflicts.push({ field: "phone", message: "Phone already in use" });
    }
    if (conflicts.length) {
      throw conflict("Phone already in use", "DUPLICATE_CREDENTIALS", conflicts);
    }

    const hashed = await bcrypt.hash(password, 12);
    let pending = await PendingRegistration.findOne({ email: normalizedEmail }).select(
      "+emailVerification.codeHash +emailVerification.expiresAt +emailVerification.sentAt +emailVerification.attempts +passwordHash"
    );

    if (!pending) {
      pending = new PendingRegistration({ email: normalizedEmail, expiresAt: getPendingRegistrationExpiryDate() });
    }

    pending.firstName = firstName || "";
    pending.lastName = lastName || "";
    pending.phone = normalizedPhone || "";
    pending.preferredLanguage = normalizedPreferredLanguage;
    pending.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
    pending.passwordHash = hashed;
    pending.agreementAcceptance = agreementAcceptance || undefined;
    pending.expiresAt = getPendingRegistrationExpiryDate();

    try {
      await issuePendingEmailVerificationCode(pending, { force: true });
    } catch (err) {
      throw err;
    }

    return {
      safeUser: buildPendingRegistrationPreview({
        firstName: pending.firstName,
        lastName: pending.lastName,
        email: pending.email,
        phone: pending.phone,
        preferredLanguage: pending.preferredLanguage,
        dateOfBirth: pending.dateOfBirth,
      }),
      accessToken: null,
      refreshToken: null,
      emailVerificationRequired: true,
    };
  }

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
    preferredLanguage: normalizedPreferredLanguage,
    // ✅ if you send ISO date string, mongoose will cast
    dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
    email: normalizedEmail,
    password: hashed,
    role: "user",
    isActive: true,
    emailVerified: false,
    agreementAcceptance: agreementAcceptance || undefined,
  });

  try {
    await issueEmailVerificationCode(user, { force: true });
  } catch (err) {
    await Session.deleteMany({ userId: user._id });
    await User.deleteOne({ _id: user._id });
    throw err;
  }

  const { accessToken, refreshToken } = await createSessionForUser({
    user,
    deviceId,
    userAgent,
    ip,
  });

  return {
    safeUser: toSafeUser(user),
    accessToken,
    refreshToken,
    emailVerificationRequired: false,
  };
};

export const requestEmailVerification = async (email) => {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail }).select(
    "+emailVerification.codeHash +emailVerification.expiresAt +emailVerification.sentAt +emailVerification.attempts"
  );

  if (user) {
    if (user.emailVerified) return { sent: true };
    await issueEmailVerificationCode(user);
    return { sent: true };
  }

  if (EMAIL_VERIFICATION_REQUIRED) {
    const pending = await PendingRegistration.findOne({
      email: normalizedEmail,
    }).select(
      "+emailVerification.codeHash +emailVerification.expiresAt +emailVerification.sentAt +emailVerification.attempts +passwordHash"
    );
    if (pending) {
      await issuePendingEmailVerificationCode(pending);
    }
  }

  return { sent: true };
};

export const verifyEmailCode = async ({
  email,
  code,
  deviceId = "default",
  userAgent = "",
  ip = "",
}) => {
  const normalizedEmail = email.toLowerCase().trim();
  const normalizedCode = String(code || "").trim();

  if (!/^\d{6}$/.test(normalizedCode)) {
    throw badRequest("Invalid verification code", "EMAIL_VERIFICATION_CODE_INVALID");
  }

  const user = await User.findOne({ email: normalizedEmail }).select(
    "+password +emailVerification.codeHash +emailVerification.expiresAt +emailVerification.sentAt +emailVerification.attempts"
  );

  if (!user) {
    if (!EMAIL_VERIFICATION_REQUIRED) {
      throw badRequest("Invalid verification code", "EMAIL_VERIFICATION_CODE_INVALID");
    }

    const pending = await PendingRegistration.findOne({
      email: normalizedEmail,
    }).select(
      "+passwordHash +emailVerification.codeHash +emailVerification.expiresAt +emailVerification.sentAt +emailVerification.attempts"
    );

    if (!pending) {
      throw badRequest("Invalid verification code", "EMAIL_VERIFICATION_CODE_INVALID");
    }

    const verification = pending.emailVerification || {};
    if (!verification.codeHash || !verification.expiresAt) {
      throw conflict(
        "Verification code has expired. Please request a new one",
        "EMAIL_VERIFICATION_CODE_EXPIRED"
      );
    }

    const now = new Date();
    if (now > new Date(verification.expiresAt)) {
      throw conflict(
        "Verification code has expired. Please request a new one",
        "EMAIL_VERIFICATION_CODE_EXPIRED"
      );
    }

    const attempts = Number(verification.attempts || 0);
    if (attempts >= EMAIL_VERIFY_MAX_ATTEMPTS) {
      throw new AppError(
        "Too many attempts. Please request a new code",
        429,
        "EMAIL_VERIFICATION_TOO_MANY_ATTEMPTS"
      );
    }

    const incomingHash = hashVerificationCode(normalizedEmail, normalizedCode);
    if (incomingHash !== verification.codeHash) {
      pending.emailVerification.attempts = attempts + 1;
      await pending.save();

      if (pending.emailVerification.attempts >= EMAIL_VERIFY_MAX_ATTEMPTS) {
        throw new AppError(
          "Too many attempts. Please request a new code",
          429,
          "EMAIL_VERIFICATION_TOO_MANY_ATTEMPTS"
        );
      }

      throw badRequest("Invalid verification code", "EMAIL_VERIFICATION_CODE_INVALID");
    }

    const conflicts = [];
    if (await User.exists({ email: normalizedEmail })) {
      conflicts.push({ field: "email", message: "Email already in use" });
    }
    if (pending.phone && (await User.exists({ phone: pending.phone }))) {
      conflicts.push({ field: "phone", message: "Phone already in use" });
    }
    if (conflicts.length) {
      const message =
        conflicts.length === 1
          ? conflicts[0].message
          : "Email and phone already in use";
      throw conflict(message, "DUPLICATE_CREDENTIALS", conflicts);
    }

    const createdUser = await User.create({
      firstName: pending.firstName || "",
      lastName: pending.lastName || "",
      phone: pending.phone || undefined,
      preferredLanguage: normalizeLanguage(pending.preferredLanguage),
      dateOfBirth: pending.dateOfBirth || null,
      email: pending.email,
      password: pending.passwordHash,
      role: "user",
      isActive: true,
      emailVerified: true,
      agreementAcceptance: pending.agreementAcceptance || undefined,
      emailVerification: {
        codeHash: "",
        expiresAt: null,
        sentAt: null,
        attempts: 0,
      },
    });

    await PendingRegistration.deleteOne({ _id: pending._id });

    const sessionTokens = await createSessionForUser({
      user: createdUser,
      deviceId,
      userAgent,
      ip,
    });

    return {
      user: toSafeUser(createdUser),
      ...sessionTokens,
      alreadyVerified: false,
    };
  }

  if (user.emailVerified) {
    const sessionTokens = await createSessionForUser({
      user,
      deviceId,
      userAgent,
      ip,
    });
    return {
      user: toSafeUser(user),
      ...sessionTokens,
      alreadyVerified: true,
    };
  }

  const verification = user.emailVerification || {};
  if (!verification.codeHash || !verification.expiresAt) {
    throw conflict(
      "Verification code has expired. Please request a new one",
      "EMAIL_VERIFICATION_CODE_EXPIRED"
    );
  }

  const now = new Date();
  if (now > new Date(verification.expiresAt)) {
    throw conflict(
      "Verification code has expired. Please request a new one",
      "EMAIL_VERIFICATION_CODE_EXPIRED"
    );
  }

  const attempts = Number(verification.attempts || 0);
  if (attempts >= EMAIL_VERIFY_MAX_ATTEMPTS) {
    throw new AppError(
      "Too many attempts. Please request a new code",
      429,
      "EMAIL_VERIFICATION_TOO_MANY_ATTEMPTS"
    );
  }

  const incomingHash = hashVerificationCode(normalizedEmail, normalizedCode);
  if (incomingHash !== verification.codeHash) {
    user.emailVerification.attempts = attempts + 1;
    await user.save();

    if (user.emailVerification.attempts >= EMAIL_VERIFY_MAX_ATTEMPTS) {
      throw new AppError(
        "Too many attempts. Please request a new code",
        429,
        "EMAIL_VERIFICATION_TOO_MANY_ATTEMPTS"
      );
    }

    throw badRequest("Invalid verification code", "EMAIL_VERIFICATION_CODE_INVALID");
  }

  user.emailVerified = true;
  user.emailVerification = {
    codeHash: "",
    expiresAt: null,
    sentAt: null,
    attempts: 0,
  };
  await user.save();

  const sessionTokens = await createSessionForUser({
    user,
    deviceId,
    userAgent,
    ip,
  });

  return {
    user: toSafeUser(user),
    ...sessionTokens,
    alreadyVerified: false,
  };
};

export const requestPasswordReset = async (email) => {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail }).select(
    "+passwordReset.codeHash +passwordReset.expiresAt +passwordReset.sentAt +passwordReset.attempts +passwordReset.resetTokenHash +passwordReset.resetTokenExpiresAt"
  );

  // Generic success for unknown emails to avoid enumeration.
  if (!user) return { sent: true };
  if (user.isActive === false) return { sent: true };

  await issuePasswordResetCode(user);
  return { sent: true };
};

export const verifyPasswordResetCode = async ({ email, code }) => {
  const normalizedEmail = email.toLowerCase().trim();
  const normalizedCode = String(code || "").trim();

  if (!/^\d{6}$/.test(normalizedCode)) {
    throw badRequest("Invalid verification code", "PASSWORD_RESET_CODE_INVALID");
  }

  const user = await User.findOne({ email: normalizedEmail }).select(
    "+passwordReset.codeHash +passwordReset.expiresAt +passwordReset.sentAt +passwordReset.attempts +passwordReset.resetTokenHash +passwordReset.resetTokenExpiresAt"
  );

  if (!user || user.isActive === false) {
    throw badRequest("Invalid verification code", "PASSWORD_RESET_CODE_INVALID");
  }

  const resetState = user.passwordReset || {};
  if (!resetState.codeHash || !resetState.expiresAt) {
    throw conflict(
      "Verification code has expired. Please request a new one",
      "PASSWORD_RESET_CODE_EXPIRED"
    );
  }

  const now = new Date();
  if (now > new Date(resetState.expiresAt)) {
    throw conflict(
      "Verification code has expired. Please request a new one",
      "PASSWORD_RESET_CODE_EXPIRED"
    );
  }

  const attempts = Number(resetState.attempts || 0);
  if (attempts >= PASSWORD_RESET_MAX_ATTEMPTS) {
    throw new AppError(
      "Too many attempts. Please request a new code",
      429,
      "PASSWORD_RESET_TOO_MANY_ATTEMPTS"
    );
  }

  const incomingHash = hashPasswordResetCode(normalizedEmail, normalizedCode);
  if (incomingHash !== resetState.codeHash) {
    user.passwordReset.attempts = attempts + 1;
    await user.save();

    if (user.passwordReset.attempts >= PASSWORD_RESET_MAX_ATTEMPTS) {
      throw new AppError(
        "Too many attempts. Please request a new code",
        429,
        "PASSWORD_RESET_TOO_MANY_ATTEMPTS"
      );
    }

    throw badRequest("Invalid verification code", "PASSWORD_RESET_CODE_INVALID");
  }

  const resetToken = signPasswordResetToken(user);
  user.passwordReset = {
    ...user.passwordReset,
    resetTokenHash: hashToken(resetToken),
    resetTokenExpiresAt: getPasswordResetTokenExpiryDate(),
  };
  await user.save();

  return {
    verified: true,
    resetToken,
    expiresInSeconds: PASSWORD_RESET_TOKEN_TTL_MINUTES * 60,
  };
};

export const resetPasswordWithToken = async ({
  resetToken,
  newPassword,
  confirmPassword,
}) => {
  const token = String(resetToken || "").trim();
  if (!token) {
    throw badRequest("Reset token is required", "PASSWORD_RESET_TOKEN_REQUIRED");
  }

  if (!newPassword || String(newPassword).length < 6) {
    throw badRequest("Password must be at least 6 characters", "PASSWORD_TOO_SHORT");
  }
  if (newPassword !== confirmPassword) {
    throw badRequest("Passwords do not match", "PASSWORD_CONFIRM_MISMATCH");
  }

  let payload;
  try {
    payload = jwt.verify(token, PASSWORD_RESET_SECRET);
  } catch {
    throw unauthorized("Invalid reset token", "PASSWORD_RESET_TOKEN_INVALID");
  }

  if (payload?.purpose !== "password_reset" || !payload?.id) {
    throw unauthorized("Invalid reset token", "PASSWORD_RESET_TOKEN_INVALID");
  }

  const user = await User.findById(payload.id).select(
    "+password +passwordReset.codeHash +passwordReset.expiresAt +passwordReset.sentAt +passwordReset.attempts +passwordReset.resetTokenHash +passwordReset.resetTokenExpiresAt"
  );
  if (!user || user.isActive === false) {
    throw unauthorized("Invalid reset token", "PASSWORD_RESET_TOKEN_INVALID");
  }

  const resetState = user.passwordReset || {};
  if (!resetState.resetTokenHash || !resetState.resetTokenExpiresAt) {
    throw unauthorized("Reset token expired", "PASSWORD_RESET_TOKEN_EXPIRED");
  }
  if (new Date() > new Date(resetState.resetTokenExpiresAt)) {
    throw unauthorized("Reset token expired", "PASSWORD_RESET_TOKEN_EXPIRED");
  }

  const incomingHash = hashToken(token);
  if (incomingHash !== resetState.resetTokenHash) {
    throw unauthorized("Invalid reset token", "PASSWORD_RESET_TOKEN_INVALID");
  }

  user.password = await bcrypt.hash(newPassword, 12);
  user.passwordReset = {
    codeHash: "",
    expiresAt: null,
    sentAt: null,
    attempts: 0,
    resetTokenHash: "",
    resetTokenExpiresAt: null,
  };

  await user.save();

  await Session.deleteMany({ userId: user._id });

  return { reset: true };
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
  await enforceUserAccessBlock(user);
  if (EMAIL_VERIFICATION_REQUIRED && !user.emailVerified) {
    throw forbidden(
      "Email is not verified. Please verify your email first",
      "EMAIL_NOT_VERIFIED"
    );
  }

  const newAccessToken = signAccessToken(user, session._id);
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

    await Session.deleteOne({ _id: sessionId });
  } catch {
    // ignore
  }
};

export const revokeSessionBySessionId = async (sessionId) => {
  if (!sessionId) return;
  await Session.deleteOne({ _id: sessionId });
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
  const session = await Session.findOne({ _id: sessionId, userId }).select("_id");
  if (!session) {
    throw notFound("Session not found", "SESSION_NOT_FOUND");
  }
  await Session.deleteOne({ _id: session._id });
  return { revoked: true };
};

export const revokeAllUserSessions = async (userId) => {
  await Session.deleteMany({ userId });
};
