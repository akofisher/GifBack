import { Router } from "express";
import { requireAuth } from "../../auth/middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/admin.middleware.js";
import {
  createAdminCategoryHandler,
  createAdminLocationCityHandler,
  createAdminLocationCountryHandler,
  deleteAdminCategoryHandler,
  deleteAdminLocationCityHandler,
  deleteAdminLocationCountryHandler,
  deleteAdminItemHandler,
  deleteAdminUserHandler,
  getAdminTopGivenLeaderboardHandler,
  getAdminItemByIdHandler,
  getAdminStatsHandler,
  listAdminCategoriesHandler,
  listAdminLocationsHandler,
  listAdminItemsHandler,
  listAdminUsersHandler,
  setAdminUserBlockedStateHandler,
  updateAdminLocationCityHandler,
  updateAdminLocationCountryHandler,
  updateAdminCategoryHandler,
  updateAdminItemHandler,
} from "../controllers/admin.controller.js";

const router = Router();

router.get("/admin/stats", requireAuth, requireAdmin, getAdminStatsHandler);
router.get(
  "/admin/leaderboard/given",
  requireAuth,
  requireAdmin,
  getAdminTopGivenLeaderboardHandler
);

router.get("/admin/users", requireAuth, requireAdmin, listAdminUsersHandler);
router.patch(
  "/admin/users/:id/status",
  requireAuth,
  requireAdmin,
  setAdminUserBlockedStateHandler
);
router.delete("/admin/users/:id", requireAuth, requireAdmin, deleteAdminUserHandler);

router.get("/admin/categories", requireAuth, requireAdmin, listAdminCategoriesHandler);
router.post("/admin/categories", requireAuth, requireAdmin, createAdminCategoryHandler);
router.patch(
  "/admin/categories/:id",
  requireAuth,
  requireAdmin,
  updateAdminCategoryHandler
);
router.delete(
  "/admin/categories/:id",
  requireAuth,
  requireAdmin,
  deleteAdminCategoryHandler
);

router.get("/admin/locations/countries", requireAuth, requireAdmin, listAdminLocationsHandler);
router.post(
  "/admin/locations/countries",
  requireAuth,
  requireAdmin,
  createAdminLocationCountryHandler
);
router.patch(
  "/admin/locations/countries/:countryId",
  requireAuth,
  requireAdmin,
  updateAdminLocationCountryHandler
);
router.delete(
  "/admin/locations/countries/:countryId",
  requireAuth,
  requireAdmin,
  deleteAdminLocationCountryHandler
);
router.post(
  "/admin/locations/countries/:countryId/cities",
  requireAuth,
  requireAdmin,
  createAdminLocationCityHandler
);
router.patch(
  "/admin/locations/countries/:countryId/cities/:cityId",
  requireAuth,
  requireAdmin,
  updateAdminLocationCityHandler
);
router.delete(
  "/admin/locations/countries/:countryId/cities/:cityId",
  requireAuth,
  requireAdmin,
  deleteAdminLocationCityHandler
);

router.get("/admin/items", requireAuth, requireAdmin, listAdminItemsHandler);
router.get("/admin/items/:id", requireAuth, requireAdmin, getAdminItemByIdHandler);
router.patch("/admin/items/:id", requireAuth, requireAdmin, updateAdminItemHandler);
router.delete("/admin/items/:id", requireAuth, requireAdmin, deleteAdminItemHandler);

export default router;
