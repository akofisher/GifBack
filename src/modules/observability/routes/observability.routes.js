import { Router } from "express";

import { requireAuth } from "../../auth/middleware/auth.middleware.js";
import { requirePermission } from "../../admin/middleware/admin.middleware.js";
import { ADMIN_PERMISSIONS } from "../../admin/rbac/rbac.js";
import {
  getEndpointPerformanceHandler,
  getMonitoringFilterOptionsHandler,
  getMonitoringOverviewHandler,
  listMonitoringFilterActorsHandler,
  listMonitoringFilterItemsHandler,
  listMonitoringFilterRequestsHandler,
  listAdminAuditLogsHandler,
  listMarketplaceEventsHandler,
} from "../controllers/observability.controller.js";

const router = Router();

router.get(
  "/admin/monitoring/overview",
  requireAuth,
  requirePermission(ADMIN_PERMISSIONS.MONITORING_VIEW),
  getMonitoringOverviewHandler
);
router.get(
  "/admin/monitoring/requests",
  requireAuth,
  requirePermission(ADMIN_PERMISSIONS.MONITORING_VIEW),
  getEndpointPerformanceHandler
);
router.get(
  "/admin/monitoring/audit-logs",
  requireAuth,
  requirePermission(ADMIN_PERMISSIONS.MONITORING_VIEW),
  listAdminAuditLogsHandler
);
router.get(
  "/admin/monitoring/marketplace-events",
  requireAuth,
  requirePermission(ADMIN_PERMISSIONS.MONITORING_VIEW),
  listMarketplaceEventsHandler
);
router.get(
  "/admin/monitoring/filter-options",
  requireAuth,
  requirePermission(ADMIN_PERMISSIONS.MONITORING_VIEW),
  getMonitoringFilterOptionsHandler
);
router.get(
  "/admin/monitoring/filter-actors",
  requireAuth,
  requirePermission(ADMIN_PERMISSIONS.MONITORING_VIEW),
  listMonitoringFilterActorsHandler
);
router.get(
  "/admin/monitoring/filter-items",
  requireAuth,
  requirePermission(ADMIN_PERMISSIONS.MONITORING_VIEW),
  listMonitoringFilterItemsHandler
);
router.get(
  "/admin/monitoring/filter-requests",
  requireAuth,
  requirePermission(ADMIN_PERMISSIONS.MONITORING_VIEW),
  listMonitoringFilterRequestsHandler
);

export default router;
