import { conflict } from "../../../utils/appError.js";
import ItemRequest from "../models/request.model.js";
import ItemTransaction from "../models/transaction.model.js";

export const GIFT_LIMIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_GIFT_LIMIT_PER_WINDOW = 2;

const parseGiftLimitPerWindow = () => {
  const parsed = Number(process.env.GIFT_LIMIT_PER_WEEK);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_GIFT_LIMIT_PER_WINDOW;
  }
  return parsed;
};

export const GIFT_LIMIT_PER_WINDOW = parseGiftLimitPerWindow();

export const getGiftLimitWindowStart = (now = new Date()) =>
  new Date(now.getTime() - GIFT_LIMIT_WINDOW_MS);

export const getGiftLimitRetryAt = (completedAt) =>
  new Date(completedAt.getTime() + GIFT_LIMIT_WINDOW_MS);

export const isWithinGiftLimitWindow = (completedAt, now = new Date()) => {
  if (!(completedAt instanceof Date) || Number.isNaN(completedAt.getTime())) {
    return false;
  }
  return completedAt.getTime() > getGiftLimitWindowStart(now).getTime();
};

const findRecentCompletedGifts = async ({
  ownerId,
  receiverId,
  session,
  now,
  transactionModel = ItemTransaction,
  requestModel = ItemRequest,
}) => {
  const windowStart = getGiftLimitWindowStart(now);

  // Source of truth is ItemTransaction so weekly limit remains valid
  // even if inactive requests are hard-deleted.
  let query = transactionModel
    .find({
      type: "GIFT",
      ownerId,
      receiverId,
      completedAt: { $gt: windowStart },
    })
    .sort({ completedAt: 1, _id: 1 })
    .limit(Math.max(GIFT_LIMIT_PER_WINDOW * 4, GIFT_LIMIT_PER_WINDOW))
    .select("requestId completedAt");

  if (session) {
    query = query.session(session);
  }

  const docs = await query.lean();

  let fallbackRequestQuery = requestModel
    .find({
      type: "GIFT",
      status: "COMPLETED",
      ownerId,
      requesterId: receiverId,
      completedAt: { $gt: windowStart },
    })
    .sort({ completedAt: 1, _id: 1 })
    .limit(Math.max(GIFT_LIMIT_PER_WINDOW * 4, GIFT_LIMIT_PER_WINDOW))
    .select("_id completedAt");

  if (session) {
    fallbackRequestQuery = fallbackRequestQuery.session(session);
  }

  const fallbackRequests = await fallbackRequestQuery.lean();
  const merged = [...(Array.isArray(docs) ? docs : []), ...(fallbackRequests || [])]
    .sort((left, right) => {
      const leftTime = new Date(left?.completedAt || 0).getTime();
      const rightTime = new Date(right?.completedAt || 0).getTime();
      if (leftTime !== rightTime) return leftTime - rightTime;
      const leftId = left?._id?.toString?.() || left?.requestId?.toString?.() || "";
      const rightId =
        right?._id?.toString?.() || right?.requestId?.toString?.() || "";
      return leftId.localeCompare(rightId);
    });
  if (!merged.length) return [];

  const uniqueByRequest = [];
  const seen = new Set();

  for (let index = 0; index < merged.length; index += 1) {
    const row = merged[index];
    const key =
      row?.requestId?.toString?.() ||
      row?._id?.toString?.() ||
      `fallback-${index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueByRequest.push(row);
    if (uniqueByRequest.length >= GIFT_LIMIT_PER_WINDOW) break;
  }

  return uniqueByRequest;
};

export const ensureWeeklyGiftLimit = async ({
  ownerId,
  receiverId,
  session,
  now = new Date(),
  transactionModel = ItemTransaction,
  requestModel = ItemRequest,
}) => {
  const recentGifts = await findRecentCompletedGifts({
    ownerId,
    receiverId,
    session,
    now,
    transactionModel,
    requestModel,
  });

  if (!Array.isArray(recentGifts) || recentGifts.length < GIFT_LIMIT_PER_WINDOW) {
    return;
  }

  const completedAt = new Date(recentGifts[0]?.completedAt);
  if (!isWithinGiftLimitWindow(completedAt, now)) return;

  throw conflict("Weekly gift limit reached", "GIFT_LIMIT_WEEKLY", [
    { field: "retryAt", message: getGiftLimitRetryAt(completedAt).toISOString() },
  ]);
};
