import {
  getMonitoringOverview,
  getMonitoringFilterOptions,
  listAdminAuditLogs,
  listEndpointPerformance,
  listMonitoringFilterActors,
  listMonitoringFilterItems,
  listMonitoringFilterRequests,
  listMarketplaceEvents,
} from "../services/observability.service.js";
import {
  adminAuditListQuerySchema,
  endpointPerformanceQuerySchema,
  monitoringLookupQuerySchema,
  marketplaceEventsQuerySchema,
  monitoringWindowQuerySchema,
} from "../validators/observability.validators.js";
import { sendList, sendSuccess } from "../../../utils/response.js";

export const getMonitoringOverviewHandler = async (req, res, next) => {
  try {
    const query = monitoringWindowQuerySchema.parse(req.query || {});
    const metrics = await getMonitoringOverview(query);
    return sendSuccess(res, { metrics, window: metrics.window });
  } catch (err) {
    return next(err);
  }
};

export const getEndpointPerformanceHandler = async (req, res, next) => {
  try {
    const query = endpointPerformanceQuerySchema.parse(req.query || {});
    const result = await listEndpointPerformance(query);
    return sendList(
      res,
      {
        items: result.items,
        pagination: result.pagination,
        key: "items",
        extra: { window: result.window },
      },
      200
    );
  } catch (err) {
    return next(err);
  }
};

export const listAdminAuditLogsHandler = async (req, res, next) => {
  try {
    const query = adminAuditListQuerySchema.parse(req.query || {});
    const result = await listAdminAuditLogs(query);
    return sendList(
      res,
      {
        items: result.logs,
        pagination: result.pagination,
        key: "logs",
        extra: { window: result.window },
      },
      200
    );
  } catch (err) {
    return next(err);
  }
};

export const listMarketplaceEventsHandler = async (req, res, next) => {
  try {
    const query = marketplaceEventsQuerySchema.parse(req.query || {});
    const result = await listMarketplaceEvents(query);
    return sendList(
      res,
      {
        items: result.events,
        pagination: result.pagination,
        key: "events",
        extra: { window: result.window },
      },
      200
    );
  } catch (err) {
    return next(err);
  }
};

export const getMonitoringFilterOptionsHandler = async (req, res, next) => {
  try {
    const options = await getMonitoringFilterOptions();
    return sendSuccess(res, { options });
  } catch (err) {
    return next(err);
  }
};

export const listMonitoringFilterActorsHandler = async (req, res, next) => {
  try {
    const query = monitoringLookupQuerySchema.parse(req.query || {});
    const result = await listMonitoringFilterActors(query);
    return sendSuccess(res, result);
  } catch (err) {
    return next(err);
  }
};

export const listMonitoringFilterItemsHandler = async (req, res, next) => {
  try {
    const query = monitoringLookupQuerySchema.parse(req.query || {});
    const result = await listMonitoringFilterItems(query);
    return sendSuccess(res, result);
  } catch (err) {
    return next(err);
  }
};

export const listMonitoringFilterRequestsHandler = async (req, res, next) => {
  try {
    const query = monitoringLookupQuerySchema.parse(req.query || {});
    const result = await listMonitoringFilterRequests(query);
    return sendSuccess(res, result);
  } catch (err) {
    return next(err);
  }
};
