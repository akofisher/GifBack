import { forbidden, notFound } from "../../../utils/appError.js";
import User from "../../user/models/user.model.js";
import {
  getRolePermissions,
  hasPermission,
  isAdminRole,
  isSuperAdminRole,
  normalizeRole,
} from "../rbac/rbac.js";

const ensureActorRole = async (req) => {
  if (req.user?.resolvedRole) {
    return req.user.resolvedRole;
  }

  const actor = await User.findById(req.user?.id)
    .select("role isActive")
    .lean();

  if (!actor) {
    throw notFound("User not found", "USER_NOT_FOUND");
  }

  if (actor.isActive === false) {
    throw forbidden("User is inactive", "USER_INACTIVE");
  }

  const resolvedRole = normalizeRole(actor.role);
  req.user.resolvedRole = resolvedRole;
  req.user.role = resolvedRole;
  req.user.permissions = getRolePermissions(resolvedRole);

  return resolvedRole;
};

export const requireAdmin = async (req, res, next) => {
  try {
    const role = await ensureActorRole(req);
    if (!isAdminRole(role)) {
      return next(forbidden("Admin access required", "ADMIN_ACCESS_REQUIRED"));
    }
    return next();
  } catch (err) {
    return next(err);
  }
};

export const requireSuperAdmin = async (req, res, next) => {
  try {
    const role = await ensureActorRole(req);
    if (!isSuperAdminRole(role)) {
      return next(
        forbidden("Super admin access required", "SUPER_ADMIN_REQUIRED")
      );
    }
    return next();
  } catch (err) {
    return next(err);
  }
};

export const requirePermission = (permission) => async (req, res, next) => {
  try {
    const role = await ensureActorRole(req);
    if (!isAdminRole(role)) {
      return next(forbidden("Admin access required", "ADMIN_ACCESS_REQUIRED"));
    }

    if (!hasPermission(role, permission)) {
      return next(
        forbidden("Permission denied", "ADMIN_PERMISSION_DENIED", [
          { field: "permission", message: permission },
        ])
      );
    }

    return next();
  } catch (err) {
    return next(err);
  }
};
