import { Router } from "express";
import { requireAuth } from "../../auth/middleware/auth.middleware.js";
import { requireAdmin } from "../../admin/middleware/admin.middleware.js";
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
  requireAdmin,
  getAdminAppVersionConfigHandler
);
router.patch(
  "/admin/app/version",
  requireAuth,
  requireAdmin,
  upsertAdminAppVersionConfigHandler
);

export default router;
