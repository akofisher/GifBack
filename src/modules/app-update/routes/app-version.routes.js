import { Router } from "express";
import { requireAuth } from "../../auth/middleware/auth.middleware.js";
import { requirePermission } from "../../admin/middleware/admin.middleware.js";
import { ADMIN_PERMISSIONS } from "../../admin/rbac/rbac.js";
import {
  getAdminAppVersionConfigHandler,
  getPublicAppVersionHandler,
  upsertAdminAppVersionConfigHandler,
} from "../controllers/app-version.controller.js";

const router = Router();

router.get("/app/version", getPublicAppVersionHandler);

router.get(
  "/admin/app/version",
  requireAuth,
  requirePermission(ADMIN_PERMISSIONS.APP_VERSION_MANAGE),
  getAdminAppVersionConfigHandler
);
router.patch(
  "/admin/app/version",
  requireAuth,
  requirePermission(ADMIN_PERMISSIONS.APP_VERSION_MANAGE),
  upsertAdminAppVersionConfigHandler
);

export default router;
