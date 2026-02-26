import { Router } from "express";
import { requireAuth } from "../../auth/middleware/auth.middleware.js";
import { requirePermission } from "../../admin/middleware/admin.middleware.js";
import { ADMIN_PERMISSIONS } from "../../admin/rbac/rbac.js";
import {
  createProductReportHandler,
  getAdminReportByIdHandler,
  listAdminReportsHandler,
  updateAdminReportStatusHandler,
} from "../controllers/report.controller.js";

const router = Router();

router.post("/reports", requireAuth, createProductReportHandler);

router.get(
  "/admin/reports",
  requireAuth,
  requirePermission(ADMIN_PERMISSIONS.REPORTS_MANAGE),
  listAdminReportsHandler
);
router.get(
  "/admin/reports/:id",
  requireAuth,
  requirePermission(ADMIN_PERMISSIONS.REPORTS_MANAGE),
  getAdminReportByIdHandler
);
router.patch(
  "/admin/reports/:id/status",
  requireAuth,
  requirePermission(ADMIN_PERMISSIONS.REPORTS_MANAGE),
  updateAdminReportStatusHandler
);

export default router;
