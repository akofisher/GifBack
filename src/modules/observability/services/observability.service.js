import mongoose from "mongoose";
import { AppError } from "../../../utils/appError.js";

import User from "../../user/models/user.model.js";
import Session from "../../auth/models/session.model.js";
import Item from "../../marketplace/models/item.model.js";
import ItemRequest from "../../marketplace/models/request.model.js";
import MarketplaceEvent from "../../marketplace/models/event.model.js";
import ProductReport from "../../reports/models/product-report.model.js";
import ApiRequestMetric from "../models/api-request-metric.model.js";
import AdminAuditLog from "../models/admin-audit-log.model.js";

const DEFAULT_WINDOW_DAYS = 7;
const MAX_WINDOW_DAYS = 90;
const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;
const LOOKUP_DEFAULT_LIMIT = 20;
const LOOKUP_MAX_LIMIT = 50;
const DEFAULT_PRESET = "last_7d";
const DEFAULT_TIMEZONE = "UTC";
const MONITORING_REQUEST_SORTS = Object.freeze([
  "requests_desc",
  "requests_asc",
  "errors_desc",
  "errors_asc",
  "latency_desc",
  "latency_asc",
  "error_rate_desc",
  "error_rate_asc",
]);
const MONITORING_METHODS = Object.freeze([
  "GET",
  "POST",
  "PATCH",
  "PUT",
  "DELETE",
  "OPTIONS",
]);
const MONITORING_ACTION_TYPES = Object.freeze(["READ", "WRITE"]);
const MONITORING_EVENT_TYPES = Object.freeze([
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

const AUTH_ERROR_CODES = [
  "MISSING_TOKEN",
  "INVALID_TOKEN",
  "TOKEN_EXPIRED",
  "SESSION_EXPIRED",
  "INVALID_REFRESH_TOKEN",
  "MISSING_REFRESH_TOKEN",
];

const SENSITIVE_KEYS = new Set([
  "password",
  "currentpassword",
  "newpassword",
  "repeatpassword",
  "confirmpassword",
  "token",
  "accesstoken",
  "refreshtoken",
  "refresh_token",
  "verificationcode",
  "pin",
  "otp",
]);

const buildPagination = ({ page = 1, limit = DEFAULT_PAGE_LIMIT, total = 0 }) => ({
  page,
  limit,
  total,
  pages: Math.max(1, Math.ceil(total / limit)),
});

const parsePagination = (input = {}) => {
  const page = Number.isInteger(input.page) && input.page > 0 ? input.page : 1;
  const limit =
    Number.isInteger(input.limit) && input.limit > 0
      ? Math.min(input.limit, MAX_PAGE_LIMIT)
      : DEFAULT_PAGE_LIMIT;

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

export const parseWindowRange = (daysInput) => {
  const parsed = Number(daysInput);
  const days =
    Number.isInteger(parsed) && parsed > 0
      ? Math.min(parsed, MAX_WINDOW_DAYS)
      : DEFAULT_WINDOW_DAYS;
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { days, from, to };
};

const toIso = (value) => (value instanceof Date ? value.toISOString() : value);

const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isTruthyString = (value) => typeof value === "string" && value.trim().length > 0;

const isValidTimezone = (tz) => {
  try {
    // Throws RangeError for invalid IANA zone.
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return true;
  } catch (_err) {
    return false;
  }
};

const getTimeZoneParts = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const byType = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      byType[part.type] = part.value;
    }
  }
  return {
    year: Number(byType.year),
    month: Number(byType.month),
    day: Number(byType.day),
    hour: Number(byType.hour),
    minute: Number(byType.minute),
    second: Number(byType.second),
  };
};

const getTimeZoneOffsetMs = (date, timeZone) => {
  const parts = getTimeZoneParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return asUtc - date.getTime();
};

const getStartOfDayInTimezone = (date, timeZone) => {
  const parts = getTimeZoneParts(date, timeZone);
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0);
  const offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offset);
};

const validateWindowRange = (from, to) => {
  if (!(from instanceof Date) || Number.isNaN(from.getTime())) {
    throw new AppError(
      "Invalid monitoring date range",
      422,
      "MONITORING_DATE_RANGE_INVALID"
    );
  }
  if (!(to instanceof Date) || Number.isNaN(to.getTime())) {
    throw new AppError(
      "Invalid monitoring date range",
      422,
      "MONITORING_DATE_RANGE_INVALID"
    );
  }
  if (from > to) {
    throw new AppError(
      "Invalid monitoring date range",
      422,
      "MONITORING_DATE_RANGE_INVALID"
    );
  }

  const rangeMs = to.getTime() - from.getTime();
  const maxMs = MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (rangeMs > maxMs) {
    throw new AppError(
      `Monitoring date range must not exceed ${MAX_WINDOW_DAYS} days`,
      422,
      "MONITORING_DATE_RANGE_TOO_LARGE",
      [{ field: "range", message: `Maximum is ${MAX_WINDOW_DAYS} days` }]
    );
  }
};

const normalizeTimeZone = (tz) => {
  if (!isTruthyString(tz)) return DEFAULT_TIMEZONE;
  const normalized = tz.trim();
  if (!isValidTimezone(normalized)) {
    throw new AppError(
      "Invalid monitoring filter",
      422,
      "MONITORING_FILTER_VALIDATION_FAILED",
      [{ field: "tz", message: "Invalid IANA timezone" }]
    );
  }
  return normalized;
};

const buildWindowResult = ({ preset, from, to, tz, isDefault }) => ({
  preset,
  from: toIso(from),
  to: toIso(to),
  tz,
  isDefault,
});

const hasCustomRange = (query) =>
  isTruthyString(query?.from) || isTruthyString(query?.to);

export const resolveMonitoringWindow = (query = {}, nowInput = new Date()) => {
  const now = nowInput instanceof Date ? nowInput : new Date();
  const tz = normalizeTimeZone(query.tz);
  const fromProvided = isTruthyString(query.from);
  const toProvided = isTruthyString(query.to);

  if (fromProvided !== toProvided) {
    throw new AppError(
      "Both from and to must be provided together",
      422,
      "MONITORING_DATE_RANGE_INVALID"
    );
  }

  if (fromProvided && toProvided) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    validateWindowRange(from, to);
    return buildWindowResult({
      preset: "custom",
      from,
      to,
      tz,
      isDefault: false,
    });
  }

  if (isTruthyString(query.preset)) {
    const preset = query.preset.trim();
    let from;
    let to = now;

    if (preset === "last_24h") {
      from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (preset === "last_7d") {
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (preset === "last_30d") {
      from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (preset === "today") {
      from = getStartOfDayInTimezone(now, tz);
    } else if (preset === "custom") {
      throw new AppError(
        "Invalid monitoring date range",
        422,
        "MONITORING_DATE_RANGE_INVALID"
      );
    } else {
      throw new AppError(
        "Invalid monitoring filter",
        422,
        "MONITORING_FILTER_VALIDATION_FAILED",
        [{ field: "preset", message: "Unsupported preset" }]
      );
    }

    validateWindowRange(from, to);
    return buildWindowResult({ preset, from, to, tz, isDefault: false });
  }

  if (query.days !== undefined) {
    const parsed = Number(query.days);
    if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
      const from = new Date(now.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      const to = now;
      return buildWindowResult({
        preset: DEFAULT_PRESET,
        from,
        to,
        tz,
        isDefault: true,
      });
    }
    if (parsed > MAX_WINDOW_DAYS) {
      throw new AppError(
        `Monitoring date range must not exceed ${MAX_WINDOW_DAYS} days`,
        422,
        "MONITORING_DATE_RANGE_TOO_LARGE",
        [{ field: "days", message: `Maximum is ${MAX_WINDOW_DAYS}` }]
      );
    }
    const from = new Date(now.getTime() - parsed * 24 * 60 * 60 * 1000);
    const to = now;
    validateWindowRange(from, to);
    return buildWindowResult({
      preset: "custom",
      from,
      to,
      tz,
      isDefault: false,
    });
  }

  const from = new Date(now.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const to = now;
  return buildWindowResult({
    preset: DEFAULT_PRESET,
    from,
    to,
    tz,
    isDefault: !hasCustomRange(query),
  });
};

export const computePercentile = (sortedValues, percentile) => {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) return 0;
  if (percentile <= 0) return sortedValues[0];
  if (percentile >= 100) return sortedValues[sortedValues.length - 1];

  const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
  const safeIndex = Math.min(Math.max(index, 0), sortedValues.length - 1);
  return sortedValues[safeIndex];
};

const toRate = (num, den) => {
  if (!den) return 0;
  return Number(((num / den) * 100).toFixed(2));
};

const normalizeSort = (sortValue) => {
  const allowed = new Set(MONITORING_REQUEST_SORTS);
  if (!allowed.has(sortValue)) return "requests_desc";
  return sortValue;
};

const parseSortDirection = (sortValue) => (sortValue.endsWith("_asc") ? 1 : -1);

const getSortKey = (sortValue) => {
  if (sortValue.startsWith("errors_")) return "errors";
  if (sortValue.startsWith("latency_")) return "avgLatencyMs";
  if (sortValue.startsWith("error_rate_")) return "errorRate";
  return "requests";
};

export const sanitizeAuditPayload = (value, depth = 0) => {
  if (value === null || value === undefined) return value;
  if (depth >= 6) return "[TRUNCATED]";

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((entry) => sanitizeAuditPayload(entry, depth + 1));
  }

  if (typeof value === "object") {
    return Object.entries(value).reduce((acc, [key, entry]) => {
      const normalizedKey = key.toLowerCase();
      if (SENSITIVE_KEYS.has(normalizedKey)) {
        acc[key] = "[REDACTED]";
        return acc;
      }

      acc[key] = sanitizeAuditPayload(entry, depth + 1);
      return acc;
    }, {});
  }

  if (typeof value === "string") {
    return value.length > 1000 ? `${value.slice(0, 1000)}...` : value;
  }

  return value;
};

export const recordAdminAuditLog = async (payload) => {
  await AdminAuditLog.create(payload);
};

const isValidObjectId = (value) =>
  typeof value === "string" && mongoose.Types.ObjectId.isValid(value);

const normalizeLookupLimit = (limit) => {
  const parsed = Number(limit);
  if (!Number.isInteger(parsed) || parsed <= 0) return LOOKUP_DEFAULT_LIMIT;
  return Math.min(parsed, LOOKUP_MAX_LIMIT);
};

const buildEmptyList = (pagination, window = null, key = "items") => ({
  [key]: [],
  pagination: buildPagination({
    page: pagination.page,
    limit: pagination.limit,
    total: 0,
  }),
  ...(window ? { window } : {}),
});

const buildTextRegex = (value) => new RegExp(escapeRegex(value.trim()), "i");

const buildUserSearchFilter = (value) => {
  const regex = buildTextRegex(value);
  return {
    $or: [{ firstName: regex }, { lastName: regex }, { email: regex }],
  };
};

const findUserIdsByText = async (value, limit = 200) => {
  if (!isTruthyString(value)) return [];
  const users = await User.find(buildUserSearchFilter(value))
    .select("_id")
    .limit(limit)
    .lean();
  return users.map((row) => row._id);
};

const mapStringIds = (rows = []) =>
  rows
    .map((value) => value?.toString?.() || null)
    .filter(Boolean);

const intersectStringIds = (left = [], right = []) => {
  const rightSet = new Set(mapStringIds(right));
  return mapStringIds(left).filter((id) => rightSet.has(id));
};

const findItemIdsByText = async (value, limit = 200) => {
  if (!isTruthyString(value)) return [];
  const regex = buildTextRegex(value);
  const ownerIds = await findUserIdsByText(value, limit);
  const filter = {
    $or: [{ title: regex }, { description: regex }],
  };
  if (ownerIds.length) {
    filter.$or.push({ ownerId: { $in: ownerIds } });
  }

  const rows = await Item.find(filter).select("_id").limit(limit).lean();
  return rows.map((row) => row._id);
};

const findRequestIdsByText = async (value, limit = 200) => {
  if (!isTruthyString(value)) return [];

  const regex = buildTextRegex(value);
  const statusCandidate = value.trim().toUpperCase();
  const userIds = await findUserIdsByText(value, limit);
  const itemIds = await findItemIdsByText(value, limit);

  const or = [
    { message: regex },
    { "itemSnapshot.title": regex },
    { "offeredItemSnapshot.title": regex },
  ];

  if (userIds.length) {
    or.push({ ownerId: { $in: userIds } });
    or.push({ requesterId: { $in: userIds } });
  }
  if (itemIds.length) {
    or.push({ itemId: { $in: itemIds } });
    or.push({ offeredItemId: { $in: itemIds } });
  }
  if (
    ["PENDING", "APPROVED", "REJECTED", "CANCELED", "EXPIRED", "COMPLETED"].includes(
      statusCandidate
    )
  ) {
    or.push({ status: statusCandidate });
  }

  const rows = await ItemRequest.find({ $or: or }).select("_id").limit(limit).lean();
  return rows.map((row) => row._id);
};

const buildIdFilter = (ids = []) => {
  const normalized = mapStringIds(ids);
  if (!normalized.length) return null;
  if (normalized.length === 1) return normalized[0];
  return { $in: normalized };
};

const serializeAuditLog = (entry) => {
  const actor =
    entry.actorId && typeof entry.actorId === "object"
      ? {
          id: entry.actorId._id?.toString?.() || "",
          firstName: entry.actorId.firstName || "",
          lastName: entry.actorId.lastName || "",
          name: [entry.actorId.firstName, entry.actorId.lastName]
            .filter(Boolean)
            .join(" ")
            .trim(),
          email: entry.actorId.email || "",
          role: entry.actorId.role || "",
        }
      : null;

  return {
    ...entry,
    id: entry._id?.toString?.() || entry._id,
    actorId: actor?.id || entry.actorId || null,
    actor,
  };
};

export const listAdminAuditLogs = async (query = {}) => {
  const pagination = parsePagination(query);
  const window = resolveMonitoringWindow(query);
  const from = new Date(window.from);
  const to = new Date(window.to);
  const filter = {};
  filter.createdAt = { $gte: from, $lte: to };

  let actorIds = null;

  if (query.actorId) {
    if (!isValidObjectId(query.actorId)) {
      return buildEmptyList(pagination, window, "logs");
    }
    actorIds = [query.actorId];
  }

  if (isTruthyString(query.actor)) {
    const actorFilterValue = query.actor.trim();
    const resolvedActorIds = isValidObjectId(actorFilterValue)
      ? [actorFilterValue]
      : await findUserIdsByText(actorFilterValue, 200);

    if (!resolvedActorIds.length) {
      return buildEmptyList(pagination, window, "logs");
    }

    actorIds = actorIds
      ? intersectStringIds(actorIds, resolvedActorIds)
      : mapStringIds(resolvedActorIds);

    if (!actorIds.length) {
      return buildEmptyList(pagination, window, "logs");
    }
  }

  if (actorIds?.length) {
    filter.actorId = buildIdFilter(actorIds);
  }

  if (query.method) filter.method = query.method;
  if (query.actionType) filter.actionType = query.actionType;
  if (typeof query.success === "boolean") filter.success = query.success;
  if (Number.isInteger(query.statusCode)) filter.statusCode = query.statusCode;

  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    filter.$or = [{ path: regex }, { routeKey: regex }, { code: regex }, { message: regex }];
  }

  const [rows, total] = await Promise.all([
    AdminAuditLog.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate({ path: "actorId", select: "firstName lastName email role" })
      .lean(),
    AdminAuditLog.countDocuments(filter),
  ]);

  return {
    logs: rows.map(serializeAuditLog),
    pagination: buildPagination({ page: pagination.page, limit: pagination.limit, total }),
    window,
  };
};

export const listMarketplaceEvents = async (query = {}) => {
  const pagination = parsePagination(query);
  const window = resolveMonitoringWindow(query);
  const from = new Date(window.from);
  const to = new Date(window.to);
  const andFilters = [{ createdAt: { $gte: from, $lte: to } }];

  if (query.type) {
    andFilters.push({ type: query.type });
  }

  let actorIds = null;
  if (query.actorId) {
    if (!isValidObjectId(query.actorId)) {
      return buildEmptyList(pagination, window, "events");
    }
    actorIds = [query.actorId];
  }
  if (isTruthyString(query.actor)) {
    const actorValue = query.actor.trim();
    const resolvedActorIds = isValidObjectId(actorValue)
      ? [actorValue]
      : await findUserIdsByText(actorValue, 200);
    if (!resolvedActorIds.length) {
      return buildEmptyList(pagination, window, "events");
    }
    actorIds = actorIds
      ? intersectStringIds(actorIds, resolvedActorIds)
      : mapStringIds(resolvedActorIds);
    if (!actorIds.length) {
      return buildEmptyList(pagination, window, "events");
    }
  }
  if (actorIds?.length) {
    andFilters.push({ actorId: buildIdFilter(actorIds) });
  }

  let itemIds = null;
  if (query.itemId) {
    if (!isValidObjectId(query.itemId)) {
      return buildEmptyList(pagination, window, "events");
    }
    itemIds = [query.itemId];
  }
  if (isTruthyString(query.item)) {
    const itemValue = query.item.trim();
    const resolvedItemIds = isValidObjectId(itemValue)
      ? [itemValue]
      : await findItemIdsByText(itemValue, 200);
    if (!resolvedItemIds.length) {
      return buildEmptyList(pagination, window, "events");
    }
    itemIds = itemIds
      ? intersectStringIds(itemIds, resolvedItemIds)
      : mapStringIds(resolvedItemIds);
    if (!itemIds.length) {
      return buildEmptyList(pagination, window, "events");
    }
  }
  if (itemIds?.length) {
    const itemFilter = buildIdFilter(itemIds);
    andFilters.push({ $or: [{ itemId: itemFilter }, { offeredItemId: itemFilter }] });
  }

  let requestIds = null;
  if (query.requestId) {
    if (!isValidObjectId(query.requestId)) {
      return buildEmptyList(pagination, window, "events");
    }
    requestIds = [query.requestId];
  }
  if (isTruthyString(query.request)) {
    const requestValue = query.request.trim();
    const resolvedRequestIds = isValidObjectId(requestValue)
      ? [requestValue]
      : await findRequestIdsByText(requestValue, 200);
    if (!resolvedRequestIds.length) {
      return buildEmptyList(pagination, window, "events");
    }
    requestIds = requestIds
      ? intersectStringIds(requestIds, resolvedRequestIds)
      : mapStringIds(resolvedRequestIds);
    if (!requestIds.length) {
      return buildEmptyList(pagination, window, "events");
    }
  }
  if (requestIds?.length) {
    andFilters.push({ requestId: buildIdFilter(requestIds) });
  }

  const filter =
    andFilters.length === 1
      ? andFilters[0]
      : {
          $and: andFilters,
        };

  const [rows, total] = await Promise.all([
    MarketplaceEvent.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate([
        { path: "actorId", select: "firstName lastName email role" },
        { path: "ownerId", select: "firstName lastName" },
        { path: "requesterId", select: "firstName lastName" },
      ])
      .lean(),
    MarketplaceEvent.countDocuments(filter),
  ]);

  return {
    events: rows.map((entry) => ({
      ...entry,
      id: entry._id?.toString?.() || entry._id,
      actorId: entry.actorId?._id?.toString?.() || entry.actorId || null,
      ownerId: entry.ownerId?._id?.toString?.() || entry.ownerId || null,
      requesterId: entry.requesterId?._id?.toString?.() || entry.requesterId || null,
      actorName: entry.actorId
        ? [entry.actorId.firstName, entry.actorId.lastName].filter(Boolean).join(" ").trim()
        : "",
      ownerName: entry.ownerId
        ? [entry.ownerId.firstName, entry.ownerId.lastName].filter(Boolean).join(" ").trim()
        : "",
      requesterName: entry.requesterId
        ? [entry.requesterId.firstName, entry.requesterId.lastName].filter(Boolean).join(" ").trim()
        : "",
    })),
    pagination: buildPagination({ page: pagination.page, limit: pagination.limit, total }),
    window,
  };
};

const buildEndpointPerformanceRows = (groupedRows, sort) => {
  const withDerived = groupedRows.map((entry) => ({
    method: entry._id.method,
    routeKey: entry._id.routeKey,
    requests: entry.total,
    errors: entry.errors,
    errorRate: toRate(entry.errors, entry.total),
    avgLatencyMs: Number((entry.avgLatencyMs || 0).toFixed(2)),
    maxLatencyMs: Number((entry.maxLatencyMs || 0).toFixed(2)),
  }));

  const normalizedSort = normalizeSort(sort);
  const sortKey = getSortKey(normalizedSort);
  const direction = parseSortDirection(normalizedSort);

  withDerived.sort((a, b) => {
    if (a[sortKey] === b[sortKey]) {
      if (a.routeKey === b.routeKey) {
        return a.method.localeCompare(b.method);
      }
      return a.routeKey.localeCompare(b.routeKey);
    }

    return (a[sortKey] - b[sortKey]) * direction;
  });

  return withDerived;
};

export const listEndpointPerformance = async (query = {}) => {
  const window = resolveMonitoringWindow(query);
  const from = new Date(window.from);
  const to = new Date(window.to);
  const pagination = parsePagination(query);

  const grouped = await ApiRequestMetric.aggregate([
    {
      $match: {
        createdAt: { $gte: from, $lte: to },
      },
    },
    {
      $group: {
        _id: { method: "$method", routeKey: "$routeKey" },
        total: { $sum: 1 },
        errors: {
          $sum: {
            $cond: [{ $gte: ["$statusCode", 400] }, 1, 0],
          },
        },
        avgLatencyMs: { $avg: "$durationMs" },
        maxLatencyMs: { $max: "$durationMs" },
      },
    },
  ]);

  const sorted = buildEndpointPerformanceRows(grouped, query.sort);
  const total = sorted.length;
  const items = sorted.slice(pagination.skip, pagination.skip + pagination.limit);

  return {
    items,
    pagination: buildPagination({ page: pagination.page, limit: pagination.limit, total }),
    window,
  };
};

const fetchLatencyPercentiles = async (from, to) => {
  const samples = await ApiRequestMetric.find({
    createdAt: { $gte: from, $lte: to },
  })
    .sort({ durationMs: 1 })
    .limit(50000)
    .select("durationMs -_id")
    .lean();

  const durations = samples
    .map((entry) => Number(entry.durationMs || 0))
    .filter((value) => Number.isFinite(value));

  return {
    p50: Number(computePercentile(durations, 50).toFixed(2)),
    p95: Number(computePercentile(durations, 95).toFixed(2)),
    p99: Number(computePercentile(durations, 99).toFixed(2)),
    sampleSize: durations.length,
  };
};

const buildUserName = (firstName, lastName) =>
  [firstName, lastName].filter(Boolean).join(" ").trim();

export const getMonitoringFilterOptions = async () => {
  const [statusCodes] = await Promise.all([
    ApiRequestMetric.distinct("statusCode").then((rows) =>
      rows
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value))
        .sort((a, b) => a - b)
    ),
  ]);

  return {
    requestSorts: MONITORING_REQUEST_SORTS,
    methods: MONITORING_METHODS,
    actionTypes: MONITORING_ACTION_TYPES,
    eventTypes: MONITORING_EVENT_TYPES,
    statusCodes,
    defaultPreset: DEFAULT_PRESET,
    maxRangeDays: MAX_WINDOW_DAYS,
  };
};

export const listMonitoringFilterActors = async (query = {}) => {
  const limit = normalizeLookupLimit(query.limit);
  const q = (query.q || "").trim();
  let users = [];

  if (q) {
    if (isValidObjectId(q)) {
      const row = await User.findById(q)
        .select("firstName lastName email role")
        .lean();
      users = row ? [row] : [];
    } else {
      users = await User.find(buildUserSearchFilter(q))
        .select("firstName lastName email role")
        .sort({ updatedAt: -1, _id: -1 })
        .limit(limit)
        .lean();
    }
  } else {
    users = await User.find({ role: { $in: ["admin", "super_admin"] } })
      .select("firstName lastName email role")
      .sort({ updatedAt: -1, _id: -1 })
      .limit(limit)
      .lean();
  }

  const actorIds = users.map((row) => row._id);
  const seenRows = actorIds.length
    ? await ApiRequestMetric.aggregate([
        { $match: { userId: { $in: actorIds } } },
        { $group: { _id: "$userId", lastSeenAt: { $max: "$createdAt" } } },
      ])
    : [];
  const seenById = new Map(
    seenRows.map((row) => [row._id?.toString?.() || "", row.lastSeenAt || null])
  );

  return {
    items: users.map((row) => {
      const id = row._id?.toString?.() || "";
      return {
        id,
        name: buildUserName(row.firstName, row.lastName),
        email: row.email || "",
        role: row.role || "",
        lastSeenAt: seenById.get(id) || null,
      };
    }),
  };
};

export const listMonitoringFilterItems = async (query = {}) => {
  const limit = normalizeLookupLimit(query.limit);
  const q = (query.q || "").trim();
  let rows = [];

  if (q) {
    if (isValidObjectId(q)) {
      const row = await Item.findById(q)
        .select("title mode status ownerId")
        .populate({ path: "ownerId", select: "firstName lastName" })
        .lean();
      rows = row ? [row] : [];
    } else {
      const regex = buildTextRegex(q);
      const ownerIds = await findUserIdsByText(q, 200);
      const filter = {
        $or: [{ title: regex }, { description: regex }],
      };
      if (ownerIds.length) {
        filter.$or.push({ ownerId: { $in: ownerIds } });
      }

      rows = await Item.find(filter)
        .select("title mode status ownerId")
        .sort({ updatedAt: -1, _id: -1 })
        .limit(limit)
        .populate({ path: "ownerId", select: "firstName lastName" })
        .lean();
    }
  } else {
    rows = await Item.find({})
      .select("title mode status ownerId")
      .sort({ updatedAt: -1, _id: -1 })
      .limit(limit)
      .populate({ path: "ownerId", select: "firstName lastName" })
      .lean();
  }

  return {
    items: rows.map((row) => ({
      id: row._id?.toString?.() || "",
      title: row.title || "",
      mode: row.mode || "",
      status: row.status || "",
      ownerName: buildUserName(row.ownerId?.firstName, row.ownerId?.lastName),
    })),
  };
};

export const listMonitoringFilterRequests = async (query = {}) => {
  const limit = normalizeLookupLimit(query.limit);
  const q = (query.q || "").trim();
  let rows = [];

  if (q) {
    if (isValidObjectId(q)) {
      const row = await ItemRequest.findById(q)
        .select("status itemId ownerId requesterId itemSnapshot")
        .populate([
          { path: "itemId", select: "title" },
          { path: "ownerId", select: "firstName lastName" },
          { path: "requesterId", select: "firstName lastName" },
        ])
        .lean();
      rows = row ? [row] : [];
    } else {
      const regex = buildTextRegex(q);
      const statusCandidate = q.toUpperCase();
      const userIds = await findUserIdsByText(q, 200);
      const itemIds = await findItemIdsByText(q, 200);

      const or = [
        { message: regex },
        { "itemSnapshot.title": regex },
        { "offeredItemSnapshot.title": regex },
      ];

      if (userIds.length) {
        or.push({ ownerId: { $in: userIds } });
        or.push({ requesterId: { $in: userIds } });
      }
      if (itemIds.length) {
        or.push({ itemId: { $in: itemIds } });
        or.push({ offeredItemId: { $in: itemIds } });
      }
      if (
        ["PENDING", "APPROVED", "REJECTED", "CANCELED", "EXPIRED", "COMPLETED"].includes(
          statusCandidate
        )
      ) {
        or.push({ status: statusCandidate });
      }

      rows = await ItemRequest.find({ $or: or })
        .select("status itemId ownerId requesterId itemSnapshot")
        .sort({ updatedAt: -1, _id: -1 })
        .limit(limit)
        .populate([
          { path: "itemId", select: "title" },
          { path: "ownerId", select: "firstName lastName" },
          { path: "requesterId", select: "firstName lastName" },
        ])
        .lean();
    }
  } else {
    rows = await ItemRequest.find({})
      .select("status itemId ownerId requesterId itemSnapshot")
      .sort({ updatedAt: -1, _id: -1 })
      .limit(limit)
      .populate([
        { path: "itemId", select: "title" },
        { path: "ownerId", select: "firstName lastName" },
        { path: "requesterId", select: "firstName lastName" },
      ])
      .lean();
  }

  return {
    items: rows.map((row) => ({
      id: row._id?.toString?.() || "",
      status: row.status || "",
      itemTitle: row.itemId?.title || row.itemSnapshot?.title || "",
      requesterName: buildUserName(row.requesterId?.firstName, row.requesterId?.lastName),
      ownerName: buildUserName(row.ownerId?.firstName, row.ownerId?.lastName),
    })),
  };
};

export const getMonitoringOverview = async (query = {}) => {
  const window = resolveMonitoringWindow(query);
  const from = new Date(window.from);
  const to = new Date(window.to);

  const [
    apiBase,
    apiStatuses,
    topSlowEndpoints,
    latencyPercentiles,
    itemCreated,
    giftItemsCreated,
    exchangeItemsCreated,
    requestsCreated,
    requestsApproved,
    requestsCompleted,
    requestsCanceled,
    requestsExpired,
    reportsCreated,
    reportsResolved,
    reportsOpen,
    usersCreated,
    activeSessions,
    activeUserIds,
    failedLogins,
    authFailures,
    rateLimited,
    adminActions,
    adminFailedActions,
    topAdminActors,
  ] = await Promise.all([
    ApiRequestMetric.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          errors: {
            $sum: {
              $cond: [{ $gte: ["$statusCode", 400] }, 1, 0],
            },
          },
          avgLatencyMs: { $avg: "$durationMs" },
        },
      },
    ]),
    ApiRequestMetric.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: "$statusCode",
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    ApiRequestMetric.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: { routeKey: "$routeKey", method: "$method" },
          requests: { $sum: 1 },
          errors: {
            $sum: {
              $cond: [{ $gte: ["$statusCode", 400] }, 1, 0],
            },
          },
          avgLatencyMs: { $avg: "$durationMs" },
        },
      },
      { $sort: { avgLatencyMs: -1, requests: -1 } },
      { $limit: 10 },
    ]),
    fetchLatencyPercentiles(from, to),
    Item.countDocuments({ createdAt: { $gte: from, $lte: to } }),
    Item.countDocuments({ mode: "GIFT", createdAt: { $gte: from, $lte: to } }),
    Item.countDocuments({ mode: "EXCHANGE", createdAt: { $gte: from, $lte: to } }),
    ItemRequest.countDocuments({ createdAt: { $gte: from, $lte: to } }),
    ItemRequest.countDocuments({ approvedAt: { $gte: from, $lte: to } }),
    ItemRequest.countDocuments({ completedAt: { $gte: from, $lte: to } }),
    ItemRequest.countDocuments({ status: "CANCELED", respondedAt: { $gte: from, $lte: to } }),
    ItemRequest.countDocuments({ status: "EXPIRED", respondedAt: { $gte: from, $lte: to } }),
    ProductReport.countDocuments({ createdAt: { $gte: from, $lte: to } }),
    ProductReport.countDocuments({ status: { $in: ["RESOLVED", "REJECTED"] }, updatedAt: { $gte: from, $lte: to } }),
    ProductReport.countDocuments({ status: { $in: ["OPEN", "REVIEWING"] } }),
    User.countDocuments({ createdAt: { $gte: from, $lte: to } }),
    Session.countDocuments({ revokedAt: null, expiresAt: { $gt: new Date() } }),
    ApiRequestMetric.distinct("userId", {
      createdAt: { $gte: from, $lte: to },
      userId: { $ne: null },
    }),
    ApiRequestMetric.countDocuments({
      createdAt: { $gte: from, $lte: to },
      routeKey: "/api/auth/login",
      statusCode: { $gte: 400 },
    }),
    ApiRequestMetric.countDocuments({
      createdAt: { $gte: from, $lte: to },
      code: { $in: AUTH_ERROR_CODES },
    }),
    ApiRequestMetric.countDocuments({
      createdAt: { $gte: from, $lte: to },
      statusCode: 429,
    }),
    AdminAuditLog.countDocuments({ createdAt: { $gte: from, $lte: to } }),
    AdminAuditLog.countDocuments({
      createdAt: { $gte: from, $lte: to },
      success: false,
    }),
    AdminAuditLog.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: "$actorId", actions: { $sum: 1 } } },
      { $sort: { actions: -1 } },
      { $limit: 5 },
    ]),
  ]);

  const apiRow = apiBase[0] || { total: 0, errors: 0, avgLatencyMs: 0 };

  const topAdminIds = topAdminActors
    .map((entry) => entry._id)
    .filter((id) => id && mongoose.Types.ObjectId.isValid(id));

  const topAdminUsers = topAdminIds.length
    ? await User.find({ _id: { $in: topAdminIds } })
        .select("firstName lastName email role")
        .lean()
    : [];

  const userById = new Map(topAdminUsers.map((entry) => [entry._id.toString(), entry]));

  return {
    window,
    api: {
      requests: apiRow.total,
      errors: apiRow.errors,
      errorRate: toRate(apiRow.errors, apiRow.total),
      avgLatencyMs: Number((apiRow.avgLatencyMs || 0).toFixed(2)),
      latencies: latencyPercentiles,
      byStatus: apiStatuses.map((row) => ({ statusCode: row._id, count: row.count })),
      topSlowEndpoints: topSlowEndpoints.map((row) => ({
        method: row._id.method,
        routeKey: row._id.routeKey,
        requests: row.requests,
        errors: row.errors,
        errorRate: toRate(row.errors, row.requests),
        avgLatencyMs: Number((row.avgLatencyMs || 0).toFixed(2)),
      })),
    },
    marketplace: {
      itemsCreated: itemCreated,
      itemsCreatedByMode: {
        GIFT: giftItemsCreated,
        EXCHANGE: exchangeItemsCreated,
      },
      requestsCreated,
      requestsApproved,
      requestsCompleted,
      requestsCanceled,
      requestsExpired,
      completionRateFromApproved: toRate(requestsCompleted, requestsApproved),
      completionRateFromCreated: toRate(requestsCompleted, requestsCreated),
    },
    moderation: {
      reportsCreated,
      reportsResolved,
      openReports: reportsOpen,
      resolutionRate: toRate(reportsResolved, reportsCreated),
    },
    users: {
      newUsers: usersCreated,
      activeUsers: activeUserIds.length,
      activeSessions,
    },
    security: {
      failedLogins,
      authFailures,
      rateLimited,
    },
    admin: {
      actions: adminActions,
      failedActions: adminFailedActions,
      failureRate: toRate(adminFailedActions, adminActions),
      topActors: topAdminActors.map((row) => {
        const user = row._id ? userById.get(row._id.toString()) : null;
        return {
          actorId: row._id?.toString?.() || null,
          actions: row.actions,
          actorName: user
            ? [user.firstName, user.lastName].filter(Boolean).join(" ").trim()
            : "",
          actorEmail: user?.email || "",
          actorRole: user?.role || "",
        };
      }),
    },
  };
};
