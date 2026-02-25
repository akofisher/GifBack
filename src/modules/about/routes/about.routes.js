import { Router } from "express";
import { requireAuth } from "../../auth/middleware/auth.middleware.js";
import { requireAdmin } from "../../admin/middleware/admin.middleware.js";
import {
  createAboutEntryHandler,
  deleteAboutEntryHandler,
  getAboutEntryHandler,
  getAdminAboutEntryHandler,
  updateAboutEntryHandler,
} from "../controllers/about.controller.js";

const router = Router();

router.get("/about", getAboutEntryHandler);

router.get("/admin/about", requireAuth, requireAdmin, getAdminAboutEntryHandler);
router.post("/admin/about", requireAuth, requireAdmin, createAboutEntryHandler);
router.patch("/admin/about", requireAuth, requireAdmin, updateAboutEntryHandler);
router.delete("/admin/about", requireAuth, requireAdmin, deleteAboutEntryHandler);

export default router;

