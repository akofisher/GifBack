import { Router } from "express";
import { requireAuth } from "../../auth/middleware/auth.middleware.js";
import { requireAdmin } from "../../admin/middleware/admin.middleware.js";
import {
  createAdminBlogHandler,
  deleteAdminBlogHandler,
  getAdminBlogHandler,
  getBlogHandler,
  listAdminBlogsHandler,
  listBlogsHandler,
  updateAdminBlogHandler,
} from "../controllers/blog.controller.js";

const router = Router();

router.get("/blogs", listBlogsHandler);
router.get("/blogs/:id", getBlogHandler);

router.get("/admin/blogs", requireAuth, requireAdmin, listAdminBlogsHandler);
router.post("/admin/blogs", requireAuth, requireAdmin, createAdminBlogHandler);
router.get("/admin/blogs/:id", requireAuth, requireAdmin, getAdminBlogHandler);
router.patch("/admin/blogs/:id", requireAuth, requireAdmin, updateAdminBlogHandler);
router.delete("/admin/blogs/:id", requireAuth, requireAdmin, deleteAdminBlogHandler);

export default router;
