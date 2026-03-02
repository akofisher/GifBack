import logger from "../../../utils/logger.js";

const DEFAULT_EXPIRE_HOURS = 72;
const DEFAULT_MAX_ACTIVE_GIFT_ITEMS = 5;
const DEFAULT_MAX_ACTIVE_EXCHANGE_ITEMS = 5;

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const parseExpireHours = () => {
  const raw = Number(process.env.REQUEST_EXPIRE_HOURS);
  if (Number.isNaN(raw) || raw <= 0) {
    logger.warn(
      { value: process.env.REQUEST_EXPIRE_HOURS },
      "REQUEST_EXPIRE_HOURS is invalid; using default"
    );
    return DEFAULT_EXPIRE_HOURS;
  }
  return raw;
};

export const REQUEST_EXPIRE_HOURS = parseExpireHours();
export const REQUEST_EXPIRE_MS = REQUEST_EXPIRE_HOURS * 60 * 60 * 1000;

export const MAX_ACTIVE_GIFT_ITEMS = parsePositiveInteger(
  process.env.MAX_ACTIVE_GIFT_ITEMS,
  DEFAULT_MAX_ACTIVE_GIFT_ITEMS
);
export const MAX_ACTIVE_EXCHANGE_ITEMS = parsePositiveInteger(
  process.env.MAX_ACTIVE_EXCHANGE_ITEMS,
  DEFAULT_MAX_ACTIVE_EXCHANGE_ITEMS
);

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export const ACTIVE_REQUEST_STATUSES = ["PENDING", "APPROVED"];
export const ALL_REQUEST_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELED",
  "EXPIRED",
  "COMPLETED",
];

export const REQUEST_BLOCK_REASONS = Object.freeze({
  ALREADY_IN_PROCESS: "ALREADY_IN_PROCESS",
  ITEM_NOT_ACTIVE: "ITEM_NOT_ACTIVE",
  OWNER_ITEM: "OWNER_ITEM",
  BLOCKED_BY_POLICY: "BLOCKED_BY_POLICY",
});

export const REQUEST_CANCELLATION_REASONS = Object.freeze({
  AUTO_CANCELED_CONFLICT: "AUTO_CANCELED_CONFLICT",
});
