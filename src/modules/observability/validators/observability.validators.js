import { z } from "zod";

export const MONITORING_PRESETS = Object.freeze([
  "last_24h",
  "last_7d",
  "last_30d",
  "today",
  "custom",
]);

export const MONITORING_REQUEST_SORTS = Object.freeze([
  "requests_desc",
  "requests_asc",
  "errors_desc",
  "errors_asc",
  "latency_desc",
  "latency_asc",
  "error_rate_desc",
  "error_rate_asc",
]);

export const MONITORING_METHODS = Object.freeze([
  "GET",
  "POST",
  "PATCH",
  "PUT",
  "DELETE",
  "OPTIONS",
]);

export const MONITORING_ACTION_TYPES = Object.freeze(["READ", "WRITE"]);

export const MONITORING_EVENT_TYPES = Object.freeze([
  "ITEM_CREATED",
  "ITEM_DELETED",
  "REQUEST_CREATED",
  "REQUEST_APPROVED",
  "REQUEST_REJECTED",
  "REQUEST_CANCELED",
  "REQUEST_EXPIRED",
  "REQUEST_COMPLETED",
  "REQUEST_AUTO_CANCELED_CONFLICT",
]);

const basePagination = {
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
};

const monitoringWindow = {
  preset: z.enum(MONITORING_PRESETS).optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  tz: z.string().trim().min(1).max(120).optional(),
  // keep backward compatibility for existing clients
  days: z.coerce.number().int().min(1).optional(),
};

export const monitoringWindowQuerySchema = z.object({
  ...monitoringWindow,
});

export const endpointPerformanceQuerySchema = z.object({
  ...basePagination,
  ...monitoringWindow,
  sort: z.enum(MONITORING_REQUEST_SORTS).optional(),
});

export const adminAuditListQuerySchema = z.object({
  ...basePagination,
  ...monitoringWindow,
  actorId: z.string().trim().optional(),
  actor: z.string().trim().max(120).optional(),
  method: z.enum(MONITORING_METHODS).optional(),
  actionType: z.enum(MONITORING_ACTION_TYPES).optional(),
  statusCode: z.coerce.number().int().min(100).max(599).optional(),
  success: z
    .preprocess((value) => {
      if (value === undefined) return undefined;
      if (typeof value === "boolean") return value;
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true") return true;
        if (normalized === "false") return false;
      }
      return value;
    }, z.boolean())
    .optional(),
  search: z.string().trim().max(120).optional(),
});

export const marketplaceEventsQuerySchema = z.object({
  ...basePagination,
  ...monitoringWindow,
  type: z.enum(MONITORING_EVENT_TYPES).optional(),
  requestId: z.string().trim().optional(),
  itemId: z.string().trim().optional(),
  actorId: z.string().trim().optional(),
  actor: z.string().trim().max(120).optional(),
  item: z.string().trim().max(120).optional(),
  request: z.string().trim().max(120).optional(),
});

export const monitoringLookupQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
