import { Router } from "express";
import { requireAuth } from "../../auth/middleware/auth.middleware.js";
import { requirePermission } from "../../admin/middleware/admin.middleware.js";
import { ADMIN_PERMISSIONS } from "../../admin/rbac/rbac.js";
import {
  createAboutEntryHandler,
  deleteAboutEntryHandler,
  getAboutEntryHandler,
  getAdminAboutEntryHandler,
  updateAboutEntryHandler,
} from "../controllers/about.controller.js";

const router = Router();

router.get("/about", getAboutEntryHandler);

router.get(
  "/admin/about",
  requireAuth,
  requirePermission(ADMIN_PERMISSIONS.ABOUT_MANAGE),
  getAdminAboutEntryHandler
);
router.post(
  "/admin/about",
  requireAuth,
  requirePermission(ADMIN_PERMISSIONS.ABOUT_MANAGE),
  createAboutEntryHandler
);
router.patch(
  "/admin/about",
  requireAuth,
  requirePermission(ADMIN_PERMISSIONS.ABOUT_MANAGE),
  updateAboutEntryHandler
);
router.delete(
  "/admin/about",
  requireAuth,
  requirePermission(ADMIN_PERMISSIONS.ABOUT_MANAGE),
  deleteAboutEntryHandler
);

export default router;
