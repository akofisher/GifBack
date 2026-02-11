import { z } from "zod";
import { REFRESH_COOKIE_NAME, getRefreshCookieOptions } from "./auth.cookies.js";
import {
  listUserSessions,
  loginUser,
  refreshAccessToken,
  registerUser,
  revokeAllUserSessions,
  revokeSession as revokeSessionByToken,
  revokeUserSessionById,
} from "./auth.service.js";
import { unauthorized } from "../../utils/appError.js";

const getClientIp = (req) =>
  req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
  req.socket?.remoteAddress ||
  req.ip ||
  "";




const registerSchema = z.object({
  firstName: z.string().min(2).max(30).optional(),
  lastName: z.string().min(2).max(30).optional(),

  first_name: z.string().min(2).max(30).optional(),
  last_name: z.string().min(2).max(30).optional(),

  dateOfBirth: z.string().optional(),
  phone: z.string().min(8).max(20).optional(),
  email: z.string().email(),
  password: z.string().min(6).max(100),

});


const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceId: z.string().optional(),
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


    const { safeUser, accessToken, refreshToken } = await registerUser({
      firstName,
      lastName,
      phone,
      email,
      password: data.password,
      dateOfBirth,
      deviceId,
      userAgent,
      ip,
    });

    // set refresh cookie
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions());

    // 🔑 explicit success response
    res.status(201).json({
      success: true,
      authenticated: true,
      message: "Registration successful",
      user: safeUser,
      accessToken,
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

    res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/auth/refresh" });
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
    res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/auth/refresh" });

    res.status(200).json({
      success: true,
      message: "Logged out from all devices",
    });
  } catch (err) {
    next(err);
  }
};
