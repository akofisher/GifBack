import { z } from "zod";
import jwt from "jsonwebtoken";
import { REFRESH_COOKIE_NAME, getRefreshCookieOptions } from "../utils/auth.cookies.js";
import {
  listUserSessions,
  loginUser,
  requestPasswordReset,
  requestEmailVerification,
  refreshAccessToken,
  registerUser,
  resetPasswordWithToken,
  revokeAllUserSessions,
  revokeSession as revokeSessionByToken,
  revokeSessionBySessionId,
  revokeUserSessionById,
  verifyEmailCode,
  verifyPasswordResetCode,
} from "../services/auth.service.js";
import { unauthorized } from "../../../utils/appError.js";

const getClientIp = (req) =>
  req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
  req.socket?.remoteAddress ||
  req.ip ||
  "";

const getBearerToken = (req) => {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
};

const getClearRefreshCookieOptions = () => {
  const options = getRefreshCookieOptions();
  return {
    path: options.path,
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
  };
};




const registerSchema = z.object({
  firstName: z.string().min(2).max(30).optional(),
  lastName: z.string().min(2).max(30).optional(),

  first_name: z.string().min(2).max(30).optional(),
  last_name: z.string().min(2).max(30).optional(),

  dateOfBirth: z.string().optional(),
  phone: z.string().min(8).max(20).optional(),
  email: z.string().email(),
  password: z.string().min(6).max(100),
  preferredLanguage: z.string().trim().max(10).optional(),
  agreementAccepted: z.boolean().optional(),
  agreementVersion: z.string().trim().max(40).optional(),

});


const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceId: z.string().optional(),
});

const requestEmailVerificationSchema = z.object({
  email: z.string().email(),
});

const verifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().trim().min(4).max(10),
  deviceId: z.string().optional(),
});

const passwordResetRequestSchema = z.object({
  email: z.string().email(),
});

const passwordResetVerifySchema = z.object({
  email: z.string().email(),
  code: z.string().trim().min(4).max(10),
});

const passwordResetConfirmSchema = z.object({
  resetToken: z.string().trim().min(1),
  newPassword: z.string().min(6).max(100),
  confirmPassword: z.string().min(6).max(100),
});

export const login = async (req, res, next) => {
 const deviceId = req.body.deviceId || "default";
const userAgent = req.headers["user-agent"] || "";
const ip = getClientIp(req);
  try {
    const data = loginSchema.parse(req.body);

    const { accessToken, refreshToken } = await loginUser({
      email: data.email.trim().toLowerCase(),
      password: data.password,
      deviceId,
      userAgent,
      ip,
    });

    // ✅ set refresh token cookie
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions());

    // ✅ send access token
    res.status(200).json({
      success: true,
      authenticated: true,
      message: "Login successful",
      accessToken,
    });
  } catch (err) {
    next(err);
  }
};

export const register = async (req, res, next) => {
 const deviceId = req.body.deviceId || "default";
const userAgent = req.headers["user-agent"] || "";
const ip = getClientIp(req);
  try {
    const data = registerSchema.parse(req.body);

    const firstName = (data.firstName ?? data.first_name ?? "").trim();
    const lastName = (data.lastName ?? data.last_name ?? "").trim();

    const email = data.email.trim().toLowerCase();
    const phone = data.phone ? data.phone.trim().replace(/\s+/g, "") : "";


   const dateOfBirth = data.dateOfBirth ? data.dateOfBirth.trim() : undefined;


    const {
      safeUser,
      accessToken,
      refreshToken,
      emailVerificationRequired,
    } = await registerUser({
      firstName,
      lastName,
      phone,
      preferredLanguage: data.preferredLanguage,
      email,
      password: data.password,
      agreementAccepted: data.agreementAccepted,
      agreementVersion: data.agreementVersion,
      dateOfBirth,
      deviceId,
      userAgent,
      ip,
    });

    if (refreshToken) {
      res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions());
    }

    // 🔑 explicit success response
    res.status(201).json({
      success: true,
      authenticated: Boolean(accessToken),
      message: emailVerificationRequired
        ? "Registration successful. Verification code sent to email"
        : "Registration successful",
      user: safeUser,
      ...(accessToken ? { accessToken } : {}),
      emailVerificationRequired: Boolean(emailVerificationRequired),
    });
  } catch (err) {
    next(err);
  }
};

export const requestEmailVerificationHandler = async (req, res, next) => {
  try {
    const data = requestEmailVerificationSchema.parse(req.body);
    await requestEmailVerification(data.email);

    res.status(200).json({
      success: true,
      message: "If the account exists, a verification code has been sent",
    });
  } catch (err) {
    next(err);
  }
};

export const verifyEmailHandler = async (req, res, next) => {
  const deviceId = req.body.deviceId || "default";
  const userAgent = req.headers["user-agent"] || "";
  const ip = getClientIp(req);
  try {
    const data = verifyEmailSchema.parse(req.body);
    const result = await verifyEmailCode({
      email: data.email,
      code: data.code,
      deviceId,
      userAgent,
      ip,
    });

    res.cookie(
      REFRESH_COOKIE_NAME,
      result.refreshToken,
      getRefreshCookieOptions()
    );

    res.status(200).json({
      success: true,
      message: result.alreadyVerified
        ? "Email was already verified"
        : "Email verified successfully",
      authenticated: true,
      user: result.user,
      accessToken: result.accessToken,
      emailVerified: true,
    });
  } catch (err) {
    next(err);
  }
};

export const requestPasswordResetHandler = async (req, res, next) => {
  try {
    const data = passwordResetRequestSchema.parse(req.body);
    await requestPasswordReset(data.email);

    res.status(200).json({
      success: true,
      message: "If the account exists, a reset code has been sent",
    });
  } catch (err) {
    next(err);
  }
};

export const verifyPasswordResetHandler = async (req, res, next) => {
  try {
    const data = passwordResetVerifySchema.parse(req.body);
    const result = await verifyPasswordResetCode({
      email: data.email,
      code: data.code,
    });

    res.status(200).json({
      success: true,
      message: "Code verified successfully",
      ...result,
    });
  } catch (err) {
    next(err);
  }
};

export const confirmPasswordResetHandler = async (req, res, next) => {
  try {
    const data = passwordResetConfirmSchema.parse(req.body);
    await resetPasswordWithToken(data);

    res.status(200).json({
      success: true,
      message: "Password has been reset successfully",
    });
  } catch (err) {
    next(err);
  }
};

export const refresh = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!refreshToken) {
      throw unauthorized("No refresh token", "MISSING_REFRESH_TOKEN");
    }

    const { accessToken, refreshToken: newRefreshToken } =
      await refreshAccessToken(refreshToken);

    // set rotated refresh cookie
    res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, getRefreshCookieOptions());

    res.status(200).json({ success: true, accessToken });
  } catch (err) {
    next(err);
  }
};


export const logout = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (refreshToken) await revokeSessionByToken(refreshToken);

    const accessToken = getBearerToken(req);
    if (accessToken) {
      try {
        const payload = jwt.verify(accessToken, process.env.JWT_SECRET);
        if (payload?.sid) {
          await revokeSessionBySessionId(payload.sid);
        }
      } catch {
        // ignore access-token parse errors on logout
      }
    }

    res.clearCookie(REFRESH_COOKIE_NAME, getClearRefreshCookieOptions());
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};


export const sessions = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const items = await listUserSessions(userId);

    res.status(200).json({ success: true, sessions: items });
  } catch (err) {
    next(err);
  }
};




export const revokeSessionById = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;

    await revokeUserSessionById(userId, sessionId);

    res.status(200).json({ success: true, message: "Session revoked" });
  } catch (err) {
    next(err);
  }
};


export const logoutAll = async (req, res, next) => {
  try {
    const userId = req.user.id;

    await revokeAllUserSessions(userId);

    // also clear cookie on this device
    res.clearCookie(REFRESH_COOKIE_NAME, getClearRefreshCookieOptions());

    res.status(200).json({
      success: true,
      message: "Logged out from all devices",
    });
  } catch (err) {
    next(err);
  }
};
