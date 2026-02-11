import bcrypt from "bcrypt";
import Session from "../auth/session.model.js"; // if you have sessions collection
import User from "./user.model.js";
import { badRequest, conflict, notFound, unauthorized } from "../../utils/appError.js";

const toSafeUser = (u) => ({
  _id: u._id.toString(),
  firstName: u.firstName,
  lastName: u.lastName,
  email: u.email,
  phone: u.phone,
  dateOfBirth: u.dateOfBirth,
  role: u.role,
  isActive: u.isActive,
  avatar: u.avatar,
  stats: u.stats,
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
});

// ✅ existing
export const getUsersPreview = async () => {
  return User.find().limit(20).lean();
};

export const getMe = async (id) => {
  return User.findById(id).select("-password").lean();
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

  // optional: change password
  if (payload.newPassword) {
    user.password = await bcrypt.hash(payload.newPassword, 12);

    // ✅ security: revoke all sessions if password changes
    if (Session) {
      await Session.updateMany({ userId }, { $set: { revokedAt: new Date() } });
    }
  }

  await user.save();

  const fresh = await User.findById(userId).lean();
  return toSafeUser(fresh);
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
