import { Router } from "express";
import { requireAuth } from "../../auth/middleware/auth.middleware.js";
import { requireAdmin } from "../../admin/middleware/admin.middleware.js";
import {
  createProductReportHandler,
  getAdminReportByIdHandler,
  listAdminReportsHandler,
  updateAdminReportStatusHandler,
} from "../controllers/report.controller.js";

const router = Router();

router.post("/reports", requireAuth, createProductReportHandler);

router.get("/admin/reports", requireAuth, requireAdmin, listAdminReportsHandler);
router.get(
  "/admin/reports/:id",
  requireAuth,
  requireAdmin,
  getAdminReportByIdHandler
);
router.patch(
  "/admin/reports/:id/status",
  requireAuth,
  requireAdmin,
  updateAdminReportStatusHandler
);

export default router;
