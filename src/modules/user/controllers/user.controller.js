import { z } from "zod";
import jwt from "jsonwebtoken";
import {
  REFRESH_COOKIE_NAME,
  getRefreshCookieOptions,
} from "../../auth/utils/auth.cookies.js";
import User from "../models/user.model.js";
import {
  changeMyPassword,
  deleteMe,
  getMe,
  getTopGivenLeaderboard,
  updateMe,
} from "../services/user.service.js";
import { badRequest, notFound } from "../../../utils/appError.js";
import { deleteMediaAssets, diffMediaRefs } from "../../media/media.service.js";




const updateMeSchema = z.object({
  firstName: z.string().min(2).max(30).optional(),
  lastName: z.string().min(2).max(30).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(6).max(30).optional(),
  preferredLanguage: z.string().trim().max(10).optional(),
  dateOfBirth: z.string().optional(), // "YYYY-MM-DD"

  avatar: z
    .object({
      url: z.string().optional(),
      path: z.string().optional(),
      filename: z.string().optional(),
      mimeType: z.string().optional(),
      size: z.number().nonnegative().optional(),
      provider: z.string().optional(),
      base64: z.string().optional(),
    })
    .optional(),

  currentPassword: z.string().min(6),
});

const deleteMeSchema = z.object({
  currentPassword: z.string().min(6),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(100),
  newPassword: z.string().min(1).max(100),
  repeatPassword: z.string().min(1).max(100),
});

const leaderboardQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(100),
});

const avatarSchema = z.object({
  url: z.string().min(1),
  path: z.string().optional(),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
  size: z.number().nonnegative().optional(),
  provider: z.string().optional(),
  publicId: z.string().optional(),
});

const updateAvatarSchema = z.object({
  avatar: avatarSchema.optional(),
  avatarUrl: z.string().min(1).optional(),
  publicId: z.string().optional(),
});

const resolveCurrentSessionId = (req) => {
  if (req.user?.sid) return req.user.sid;

  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!refreshToken) return null;

  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    if (payload?.id?.toString?.() !== req.user?.id?.toString?.()) return null;
    return payload?.sid || null;
  } catch {
    return null;
  }
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

export const updateMeHandler = async (req, res, next) => {
  try {
    const data = updateMeSchema.parse(req.body);
    const userId = req.user.id;

    if (data.email !== undefined) {
      throw badRequest(
        "Email cannot be changed from this endpoint",
        "EMAIL_CHANGE_NOT_ALLOWED"
      );
    }
    if (data.dateOfBirth !== undefined) {
      throw badRequest(
        "Date of birth cannot be changed from this endpoint",
        "DATE_OF_BIRTH_CHANGE_NOT_ALLOWED"
      );
    }

    const safeUser = await updateMe(userId, data);

    res.status(200).json({
      success: true,
      message: "Profile updated",
      user: safeUser,
    });
  } catch (err) {
    next(err);
  }
};

export const deleteMeHandler = async (req, res, next) => {
  try {
    const { currentPassword } = deleteMeSchema.parse(req.body);
    const userId = req.user.id;

    await deleteMe(userId, currentPassword);

    // clear refresh cookie so device can’t refresh anymore
    res.clearCookie(REFRESH_COOKIE_NAME, getClearRefreshCookieOptions());

    res.status(200).json({
      success: true,
      message: "Account deleted",
    });
  } catch (err) {
    next(err);
  }
};

export const changeMyPasswordHandler = async (req, res, next) => {
  try {
    const data = changePasswordSchema.parse(req.body);
    const result = await changeMyPassword(
      req.user.id,
      data.currentPassword,
      data.newPassword,
      data.repeatPassword,
      resolveCurrentSessionId(req)
    );

    if (result.refreshToken) {
      res.cookie(
        REFRESH_COOKIE_NAME,
        result.refreshToken,
        getRefreshCookieOptions()
      );
    }

    res.status(200).json({
      success: true,
      message: "Password changed successfully",
      ...(result.accessToken ? { accessToken: result.accessToken } : {}),
    });
  } catch (err) {
    next(err);
  }
};





export const me = async (req, res, next) => {
  try {
    const user = await getMe(req.user.id);
    if (!user) throw notFound("User not found", "USER_NOT_FOUND");

    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/users/me/avatar
 * Body: { avatar?: ImageObject, avatarUrl?: string, publicId?: string }
 */
export const updateMyAvatar = async (req, res, next) => {
  try {
    const payload = updateAvatarSchema.parse(req.body || {});
    if (!payload.avatar?.url && !payload.avatarUrl) {
      throw badRequest("avatarUrl is required", "MISSING_AVATAR_URL");
    }
    const user = await User.findById(req.user.id);
    if (!user) {
      throw notFound("User not found", "USER_NOT_FOUND");
    }

    const previousAvatar = user.avatar ? [user.avatar.toObject?.() || user.avatar] : [];
    const nextAvatar = payload.avatar
      ? {
          ...payload.avatar,
          provider: payload.avatar.provider || "local",
        }
      : {
          url: payload.avatarUrl || "",
          publicId: payload.publicId || "",
          provider: "local",
        };

    user.avatar = {
      ...user.avatar?.toObject?.(),
      ...nextAvatar,
    };
    await user.save();

    const staleAvatar = diffMediaRefs(previousAvatar, [user.avatar]);
    await deleteMediaAssets(staleAvatar);

    const safeUser = await User.findById(req.user.id).select("-password");

    res.status(200).json({ success: true, user: safeUser });
  } catch (e) {
    next(e);
  }
};

export const getTopGivenLeaderboardHandler = async (req, res, next) => {
  try {
    const query = leaderboardQuerySchema.parse(req.query || {});
    const data = await getTopGivenLeaderboard(query.limit);

    res.status(200).json({
      success: true,
      data,
      leaderboard: data.items,
    });
  } catch (err) {
    next(err);
  }
};
