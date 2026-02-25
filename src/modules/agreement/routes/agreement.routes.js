import { Router } from "express";
import { requireAuth } from "../../auth/middleware/auth.middleware.js";
import { requireAdmin } from "../../admin/middleware/admin.middleware.js";
import {
  getAdminAgreementHandler,
  getPublicAgreementHandler,
  upsertAgreementHandler,
} from "../controllers/agreement.controller.js";

const router = Router();

router.get("/agreement", getPublicAgreementHandler);

router.get("/admin/agreement", requireAuth, requireAdmin, getAdminAgreementHandler);
router.patch("/admin/agreement", requireAuth, requireAdmin, upsertAgreementHandler);

export default router;
