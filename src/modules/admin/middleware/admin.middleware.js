import { forbidden } from "../../../utils/appError.js";

export const requireAdmin = (req, res, next) => {
  if (req.user?.role?.toLowerCase?.() !== "admin") {
    return next(forbidden("Admin access required", "FORBIDDEN"));
  }
  return next();
};
