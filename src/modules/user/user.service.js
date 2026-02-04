import bcrypt from "bcrypt";
import Session from "../auth/session.model.js"; // if you have sessions collection
import User from "./user.model.js";

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
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }

  if (!payload.currentPassword) {
    const err = new Error("Current password is required");
    err.status = 400;
    throw err;
  }

  const ok = await bcrypt.compare(payload.currentPassword, user.password);
  if (!ok) {
    const err = new Error("Wrong password");
    err.status = 401;
    throw err;
  }

  // ✅ allowlist updates (only what you want editable)
  if (typeof payload.firstName === "string") user.firstName = payload.firstName.trim();
  if (typeof payload.lastName === "string") user.lastName = payload.lastName.trim();
  if (typeof payload.phone === "string") user.phone = payload.phone.trim();

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
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }

  const ok = await bcrypt.compare(currentPassword, user.password);
  if (!ok) {
    const err = new Error("Wrong password");
    err.status = 401;
    throw err;
  }

  if (Session) {
    await Session.updateMany({ userId }, { $set: { revokedAt: new Date() } });
  }

  await User.deleteOne({ _id: userId });

  return { deleted: true };
};
