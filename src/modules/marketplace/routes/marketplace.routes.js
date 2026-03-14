import { Router } from "express";
import { optionalAuth, requireAuth } from "../../auth/middleware/auth.middleware.js";
import {
  cancelRequestHandler,
  deleteRequestHandler,
  hardDeleteRequestHandler,
  confirmRequestHandler,
  createItemHandler,
  createRequestHandler,
  deleteItemHandler,
  getItemHandler,
  getRequestHandler,
  historyHandler,
  listCategoriesHandler,
  listLocationsHandler,
  listIncomingRequestsHandler,
  listItemsHandler,
  listMyItemsHandler,
  listMyRequestsHandler,
  markRequestNotificationsReadHandler,
  notificationsSummaryHandler,
  respondRequestHandler,
  updateItemHandler,
} from "../controllers/marketplace.controller.js";

const router = Router();

router.get("/categories", listCategoriesHandler);
router.get("/locations", listLocationsHandler);

router.post("/items", requireAuth, createItemHandler);
router.get("/items", optionalAuth, listItemsHandler);
router.get("/items/:id", optionalAuth, getItemHandler);
router.get("/me/items", requireAuth, listMyItemsHandler);
router.patch("/items/:id", requireAuth, updateItemHandler);
router.delete("/items/:id", requireAuth, deleteItemHandler);

router.post("/items/:itemId/requests", requireAuth, createRequestHandler);
router.get("/me/requests", requireAuth, listMyRequestsHandler);
router.get("/me/incoming-requests", requireAuth, listIncomingRequestsHandler);
router.get("/me/notifications/summary", requireAuth, notificationsSummaryHandler);
router.patch(
  "/me/notifications/requests/read",
  requireAuth,
  markRequestNotificationsReadHandler
);
router.get("/requests/:id", requireAuth, getRequestHandler);
router.patch("/requests/:id/respond", requireAuth, respondRequestHandler);
router.patch("/requests/:id/confirm", requireAuth, confirmRequestHandler);
router.patch("/requests/:id/cancel", requireAuth, cancelRequestHandler);
router.delete("/requests/:id", requireAuth, deleteRequestHandler);
router.delete("/requests/:id/hard", requireAuth, hardDeleteRequestHandler);

router.get("/me/history", requireAuth, historyHandler);

export default router;
