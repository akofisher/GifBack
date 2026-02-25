import { conflict } from "../../../utils/appError.js";
import ItemTransaction from "../models/transaction.model.js";

export const GIFT_LIMIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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

const findLatestCompletedGift = async ({
  ownerId,
  receiverId,
  session,
  now,
  transactionModel = ItemTransaction,
}) => {
  const windowStart = getGiftLimitWindowStart(now);

  let query = transactionModel
    .findOne({
      type: "GIFT",
      ownerId,
      receiverId,
      completedAt: { $gt: windowStart },
    })
    .sort({ completedAt: -1 })
    .select("completedAt");

  if (session) {
    query = query.session(session);
  }

  return query.lean();
};

export const ensureWeeklyGiftLimit = async ({
  ownerId,
  receiverId,
  session,
  now = new Date(),
  transactionModel = ItemTransaction,
}) => {
  const latestGift = await findLatestCompletedGift({
    ownerId,
    receiverId,
    session,
    now,
    transactionModel,
  });

  if (!latestGift?.completedAt) return;

  const completedAt = new Date(latestGift.completedAt);
  if (!isWithinGiftLimitWindow(completedAt, now)) return;

  throw conflict("Weekly gift limit reached", "GIFT_LIMIT_WEEKLY", [
    { field: "retryAt", message: getGiftLimitRetryAt(completedAt).toISOString() },
  ]);
};
