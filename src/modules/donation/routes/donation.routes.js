import { Router } from "express";
import { requireAuth } from "../../auth/middleware/auth.middleware.js";
import { requirePermission } from "../../admin/middleware/admin.middleware.js";
import { ADMIN_PERMISSIONS } from "../../admin/rbac/rbac.js";
import {
  getAdminDonationsHandler,
  getPublicDonationsHandler,
  updateAdminDonationsHandler,
} from "../controllers/donation.controller.js";

const router = Router();

router.get("/donations", getPublicDonationsHandler);

router.get(
  "/admin/donations",
  requireAuth,
  requirePermission(ADMIN_PERMISSIONS.DONATIONS_MANAGE),
  getAdminDonationsHandler
);
router.patch(
  "/admin/donations",
  requireAuth,
  requirePermission(ADMIN_PERMISSIONS.DONATIONS_MANAGE),
  updateAdminDonationsHandler
);

export default router;
