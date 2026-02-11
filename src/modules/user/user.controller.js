import { z } from "zod";
import cloudinary from "../../config/cloudinary.js";
import { REFRESH_COOKIE_NAME } from "../auth/auth.cookies.js";
import User from "./user.model.js";
import { deleteMe, getMe, updateMe } from "./user.service.js";
import { badRequest, notFound } from "../../utils/appError.js";




const updateMeSchema = z.object({
  firstName: z.string().min(2).max(30).optional(),
  lastName: z.string().min(2).max(30).optional(),
  phone: z.string().min(6).max(30).optional(),
  dateOfBirth: z.string().optional(), // "YYYY-MM-DD"

  avatar: z
    .object({
      url: z.string().optional(),
      base64: z.string().optional(),
    })
    .optional(),

  currentPassword: z.string().min(6),
  newPassword: z.string().min(6).max(100).optional(),
});

const deleteMeSchema = z.object({
  currentPassword: z.string().min(6),
});

export const updateMeHandler = async (req, res, next) => {
  try {
    const data = updateMeSchema.parse(req.body);
    const userId = req.user.id;

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
    res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/auth/refresh" });

    res.status(200).json({
      success: true,
      message: "Account deleted",
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



export const getAvatarUploadSignature = async (req, res, next) => {
  try {
    const timestamp = Math.floor(Date.now() / 1000);

    // keep uploads organized
    const folder = `avatars/${req.user.id}`;

    const paramsToSign = {
      timestamp,
      folder,
      // optional: force transformations at upload time
      // eager: "c_fill,w_512,h_512,q_auto,f_auto",
    };

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET
    );

    res.json({
      success: true,
      timestamp,
      signature,
      folder,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
    });
  } catch (e) {
    next(e);
  }
};


/**
 * PATCH /api/users/me/avatar
 * Body: { avatarUrl: string, publicId?: string }
 */
export const updateMyAvatar = async (req, res, next) => {
  try {
    const { avatarUrl, publicId } = req.body;

    if (!avatarUrl) {
      throw badRequest("avatarUrl is required", "MISSING_AVATAR_URL");
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        avatar: {
          url: avatarUrl,
          publicId: publicId || "",
        },
      },
      { new: true }
    ).select("-password");

    res.status(200).json({ success: true, user });
  } catch (e) {
    next(e);
  }
};

