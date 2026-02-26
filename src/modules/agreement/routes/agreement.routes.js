import { Router } from "express";
import { requireAuth } from "../../auth/middleware/auth.middleware.js";
import { requirePermission } from "../../admin/middleware/admin.middleware.js";
import { ADMIN_PERMISSIONS } from "../../admin/rbac/rbac.js";
import {
  getAdminAgreementHandler,
  getPublicAgreementHandler,
  upsertAgreementHandler,
} from "../controllers/agreement.controller.js";

const router = Router();

router.get("/agreement", getPublicAgreementHandler);

router.get(
  "/admin/agreement",
  requireAuth,
  requirePermission(ADMIN_PERMISSIONS.AGREEMENT_MANAGE),
  getAdminAgreementHandler
);
router.patch(
  "/admin/agreement",
  requireAuth,
  requirePermission(ADMIN_PERMISSIONS.AGREEMENT_MANAGE),
  upsertAgreementHandler
);

export default router;
