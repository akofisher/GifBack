import { Router } from "express";
import { requireAuth } from "../../auth/middleware/auth.middleware.js";
import { requirePermission } from "../../admin/middleware/admin.middleware.js";
import { ADMIN_PERMISSIONS } from "../../admin/rbac/rbac.js";
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

router.get(
  "/admin/blogs",
  requireAuth,
  requirePermission(ADMIN_PERMISSIONS.BLOGS_MANAGE),
  listAdminBlogsHandler
);
router.post(
  "/admin/blogs",
  requireAuth,
  requirePermission(ADMIN_PERMISSIONS.BLOGS_MANAGE),
  createAdminBlogHandler
);
router.get(
  "/admin/blogs/:id",
  requireAuth,
  requirePermission(ADMIN_PERMISSIONS.BLOGS_MANAGE),
  getAdminBlogHandler
);
router.patch(
  "/admin/blogs/:id",
  requireAuth,
  requirePermission(ADMIN_PERMISSIONS.BLOGS_MANAGE),
  updateAdminBlogHandler
);
router.delete(
  "/admin/blogs/:id",
  requireAuth,
  requirePermission(ADMIN_PERMISSIONS.BLOGS_MANAGE),
  deleteAdminBlogHandler
);

export default router;
