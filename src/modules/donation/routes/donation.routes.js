import { Router } from "express";
import { requireAuth } from "../../auth/middleware/auth.middleware.js";
import { requireAdmin } from "../../admin/middleware/admin.middleware.js";
import {
  getAdminDonationsHandler,
  getPublicDonationsHandler,
  updateAdminDonationsHandler,
} from "../controllers/donation.controller.js";

const router = Router();

router.get("/donations", getPublicDonationsHandler);

router.get("/admin/donations", requireAuth, requireAdmin, getAdminDonationsHandler);
router.patch(
  "/admin/donations",
  requireAuth,
  requireAdmin,
  updateAdminDonationsHandler
);

export default router;
