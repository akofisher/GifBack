import crypto from "crypto";
import jwt from "jsonwebtoken";
import { normalizeLanguage } from "../../../i18n/localization.js";
import { normalizeRole } from "../../admin/rbac/rbac.js";
import {
  ACCESS_TTL,
  EMAIL_VERIFICATION_SECRET,
  EMAIL_VERIFY_CODE_TTL_MINUTES,
  PASSWORD_RESET_CODE_TTL_MINUTES,
  PASSWORD_RESET_SECRET,
  PASSWORD_RESET_TOKEN_TTL_MINUTES,
  PENDING_REGISTRATION_TTL_HOURS,
  REFRESH_TTL,
} from "./auth.config.js";

export const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

export const hashVerificationCode = (email, code) =>
  crypto
    .createHash("sha256")
    .update(`${email.toLowerCase().trim()}|${code}|${EMAIL_VERIFICATION_SECRET}`)
    .digest("hex");

export const hashPasswordResetCode = (email, code) =>
  crypto
    .createHash("sha256")
    .update(`${email.toLowerCase().trim()}|${code}|${PASSWORD_RESET_SECRET}`)
    .digest("hex");

export const randomVerificationCode = () =>
  String(crypto.randomInt(100000, 1000000));

export const getVerificationExpiryDate = () =>
  new Date(Date.now() + EMAIL_VERIFY_CODE_TTL_MINUTES * 60 * 1000);

export const getPendingRegistrationExpiryDate = () =>
  new Date(Date.now() + PENDING_REGISTRATION_TTL_HOURS * 60 * 60 * 1000);

export const getPasswordResetCodeExpiryDate = () =>
  new Date(Date.now() + PASSWORD_RESET_CODE_TTL_MINUTES * 60 * 1000);

export const getPasswordResetTokenExpiryDate = () =>
  new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000);

export const signPasswordResetToken = (user) =>
  jwt.sign(
    { id: user._id.toString(), purpose: "password_reset" },
    PASSWORD_RESET_SECRET,
    { expiresIn: `${PASSWORD_RESET_TOKEN_TTL_MINUTES}m` }
  );

export const signAccessToken = (user, sessionId = null) =>
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

export const signRefreshToken = (user, sessionId) =>
  jwt.sign(
    { id: user._id.toString(), sid: sessionId.toString() },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TTL }
  );

export const refreshExpiresAt = () => {
  const days = Number(process.env.REFRESH_COOKIE_DAYS || 365);
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
};
