import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import logger from "../../../utils/logger.js";
import { normalizeLanguage } from "../../../i18n/localization.js";
import User from "../../user/models/user.model.js";
import Session from "../models/session.model.js";
import PendingRegistration from "../models/pending-registration.model.js";
import {
  validateAgreementAcceptanceForRegistration,
} from "../../agreement/services/agreement.service.js";
import { AppError, badRequest, conflict, forbidden, notFound, unauthorized } from "../../../utils/appError.js";
import { getRolePermissions, normalizeRole } from "../../admin/rbac/rbac.js";

const ACCESS_TTL = process.env.ACCESS_TOKEN_TTL || "15m";
const REFRESH_TTL = process.env.REFRESH_TOKEN_TTL || "365d";
const parseEnvBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const EMAIL_VERIFICATION_REQUIRED = parseEnvBoolean(
  process.env.EMAIL_VERIFICATION_REQUIRED,
  true
);
const EMAIL_VERIFY_CODE_TTL_MINUTES = Number(
  process.env.EMAIL_VERIFY_CODE_TTL_MINUTES || 10
);
const EMAIL_VERIFY_RESEND_COOLDOWN_SECONDS = Number(
  process.env.EMAIL_VERIFY_RESEND_COOLDOWN_SECONDS || 60
);
const EMAIL_VERIFY_MAX_ATTEMPTS = Number(
  process.env.EMAIL_VERIFY_MAX_ATTEMPTS || 5
);
const EMAIL_VERIFICATION_SECRET =
  process.env.EMAIL_VERIFICATION_SECRET || process.env.JWT_SECRET || "email-secret";
const PENDING_REGISTRATION_TTL_HOURS = Number(
  process.env.PENDING_REGISTRATION_TTL_HOURS || 24
);
const PASSWORD_RESET_CODE_TTL_MINUTES = Number(
  process.env.PASSWORD_RESET_CODE_TTL_MINUTES || 10
);
const PASSWORD_RESET_RESEND_COOLDOWN_SECONDS = Number(
  process.env.PASSWORD_RESET_RESEND_COOLDOWN_SECONDS || 60
);
const PASSWORD_RESET_MAX_ATTEMPTS = Number(
  process.env.PASSWORD_RESET_MAX_ATTEMPTS || 5
);
const PASSWORD_RESET_TOKEN_TTL_MINUTES = Number(
  process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || 15
);
const PASSWORD_RESET_SECRET =
  process.env.PASSWORD_RESET_SECRET || process.env.JWT_SECRET || "password-reset-secret";

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const hashVerificationCode = (email, code) =>
  crypto
    .createHash("sha256")
    .update(`${email.toLowerCase().trim()}|${code}|${EMAIL_VERIFICATION_SECRET}`)
    .digest("hex");

const hashPasswordResetCode = (email, code) =>
  crypto
    .createHash("sha256")
    .update(`${email.toLowerCase().trim()}|${code}|${PASSWORD_RESET_SECRET}`)
    .digest("hex");

const randomVerificationCode = () =>
  String(crypto.randomInt(100000, 1000000));

const getVerificationExpiryDate = () =>
  new Date(Date.now() + EMAIL_VERIFY_CODE_TTL_MINUTES * 60 * 1000);

const getPendingRegistrationExpiryDate = () =>
  new Date(Date.now() + PENDING_REGISTRATION_TTL_HOURS * 60 * 60 * 1000);

const getPasswordResetCodeExpiryDate = () =>
  new Date(Date.now() + PASSWORD_RESET_CODE_TTL_MINUTES * 60 * 1000);

const getPasswordResetTokenExpiryDate = () =>
  new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000);

const signPasswordResetToken = (user) =>
  jwt.sign(
    { id: user._id.toString(), purpose: "password_reset" },
    PASSWORD_RESET_SECRET,
    { expiresIn: `${PASSWORD_RESET_TOKEN_TTL_MINUTES}m` }
  );

const signAccessToken = (user, sessionId = null) =>
  jwt.sign(
    {
      id: user._id.toString(),
      role: normalizeRole(user.role),
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

const refreshExpiresAt = () => {
  const days = Number(process.env.REFRESH_COOKIE_DAYS || 365);
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
};

const toSafeUser = (user) => ({
  _id: user._id.toString(),
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  emailVerified: Boolean(user.emailVerified),
  phone: user.phone,
  preferredLanguage: normalizeLanguage(user.preferredLanguage),
  role: normalizeRole(user.role),
  permissions: getRolePermissions(user.role),
  isActive: user.isActive,
  avatar: user.avatar,
  stats: user.stats,
  agreementAcceptance: {
    version: user.agreementAcceptance?.version || "",
    acceptedAt: user.agreementAcceptance?.acceptedAt || null,
  },
  dateOfBirth: user.dateOfBirth,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const buildPendingRegistrationPreview = ({
  firstName = "",
  lastName = "",
  email = "",
  phone = "",
  preferredLanguage = "en",
  dateOfBirth = null,
}) => ({
  _id: null,
  firstName,
  lastName,
  email,
  phone,
  preferredLanguage: normalizeLanguage(preferredLanguage),
  emailVerified: false,
  role: "user",
  permissions: getRolePermissions("user"),
  isActive: false,
  avatar: null,
  stats: {
    giving: 0,
    exchanging: 0,
    exchanged: 0,
    given: 0,
  },
  agreementAcceptance: {
    version: "",
    acceptedAt: null,
  },
  dateOfBirth,
  createdAt: null,
  updatedAt: null,
});

const getEmailTransportConfig = () => {
  const host = process.env.SMTP_HOST || "";
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";
  const from = process.env.SMTP_FROM || user;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = (process.env.SMTP_SECURE || "false").toLowerCase() === "true";

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
  };
};

const sendCodeEmail = async ({
  to,
  code,
  subject,
  title,
  intro,
  expiresMinutes,
}) => {
  const config = getEmailTransportConfig();
  if (!config.host || !config.user || !config.pass || !config.from) {
    throw new AppError(
      "Email service is not configured",
      500,
      "EMAIL_NOT_CONFIGURED"
    );
  }

  let nodemailer;
  try {
    const imported = await import("nodemailer");
    nodemailer = imported.default || imported;
  } catch (err) {
    logger.error({ err }, "nodemailer import failed");
    throw new AppError(
      "Email transport is unavailable. Install nodemailer dependency.",
      500,
      "EMAIL_TRANSPORT_NOT_AVAILABLE"
    );
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  const appName = process.env.APP_NAME || "Marketplace";
  const emailSubject = `${appName} ${subject}`;
  const text = `${intro} ${code}. It expires in ${expiresMinutes} minutes.`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.4">
      <h2>${appName}</h2>
      <p>${title}</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p>
      <p>This code expires in ${expiresMinutes} minutes.</p>
      <p>If you did not request this, ignore this email.</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: config.from,
      to,
      subject: emailSubject,
      text,
      html,
    });
  } catch (err) {
    logger.error({ err }, "Failed to send verification email");
    throw new AppError(
      "Unable to send verification email",
      502,
      "EMAIL_DELIVERY_FAILED"
    );
  }
};

const sendVerificationEmail = async ({ to, code }) =>
  sendCodeEmail({
    to,
    code,
    subject: "email verification code",
    title: "Your verification code:",
    intro: "Your verification code is",
    expiresMinutes: EMAIL_VERIFY_CODE_TTL_MINUTES,
  });

const sendPasswordResetEmail = async ({ to, code }) =>
  sendCodeEmail({
    to,
    code,
    subject: "password reset code",
    title: "Your password reset code:",
    intro: "Your password reset code is",
    expiresMinutes: PASSWORD_RESET_CODE_TTL_MINUTES,
  });

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

  if (user.isActive === false) {
    throw forbidden("User is inactive", "USER_INACTIVE");
  }
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

  await Session.updateMany(
    { userId: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );

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
  if (user.isActive === false) {
    throw forbidden("User is inactive", "USER_INACTIVE");
  }
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

    await Session.findByIdAndUpdate(sessionId, { revokedAt: new Date() });
  } catch {
    // ignore
  }
};

export const revokeSessionBySessionId = async (sessionId) => {
  if (!sessionId) return;
  await Session.findByIdAndUpdate(sessionId, { revokedAt: new Date() });
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
