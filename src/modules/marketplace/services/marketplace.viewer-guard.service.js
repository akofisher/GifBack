import logger from "../../../utils/logger.js";
import ItemRequest from "../models/request.model.js";
import ItemTransaction from "../models/transaction.model.js";
import { GIFT_LIMIT_PER_WINDOW, getGiftLimitRetryAt, getGiftLimitWindowStart } from "./gift-limit.service.js";
import { ALL_REQUEST_STATUSES } from "./marketplace.constants.js";
import { resolveViewerRequestState } from "./marketplace.presenters.js";

const REQUEST_GUARD_DEBUG_VIEWER_ID = (
  process.env.REQUEST_GUARD_DEBUG_VIEWER_ID || ""
).trim();
const REQUEST_GUARD_DEBUG_ITEM_ID = (
  process.env.REQUEST_GUARD_DEBUG_ITEM_ID || ""
).trim();

const shouldDebugRequestGuard = ({ viewerId, itemId }) => {
  if (!REQUEST_GUARD_DEBUG_VIEWER_ID || !REQUEST_GUARD_DEBUG_ITEM_ID) {
    return false;
  }
  return (
    String(viewerId) === REQUEST_GUARD_DEBUG_VIEWER_ID &&
    String(itemId) === REQUEST_GUARD_DEBUG_ITEM_ID
  );
};

export const deriveGiftPolicyOwnerState = ({
  now = new Date(),
  transactionRows = [],
  requestRows = [],
  limit = GIFT_LIMIT_PER_WINDOW,
}) => {
  const perOwner = new Map();
  const append = (row, ownerId, completionKey) => {
    const ownerKey = ownerId?.toString?.() || String(ownerId || "");
    if (!ownerKey) return;
    const completedAt = row?.completedAt ? new Date(row.completedAt) : null;
    if (!completedAt || Number.isNaN(completedAt.getTime())) return;

    if (!perOwner.has(ownerKey)) {
      perOwner.set(ownerKey, {
        seen: new Set(),
        completions: [],
      });
    }

    const entry = perOwner.get(ownerKey);
    if (entry.seen.has(completionKey)) return;

    entry.seen.add(completionKey);
    entry.completions.push(completedAt);
  };

  for (let index = 0; index < (transactionRows || []).length; index += 1) {
    const tx = transactionRows[index];
    const completionKey =
      tx?.requestId?.toString?.() ||
      tx?._id?.toString?.() ||
      `tx-fallback-${index}`;
    append(tx, tx?.ownerId, completionKey);
  }

  for (const request of requestRows || []) {
    const completionKey = request?._id?.toString?.();
    append(request, request?.ownerId, completionKey);
  }

  const stateByOwner = new Map();
  for (const [ownerKey, entry] of perOwner.entries()) {
    const completions = (entry.completions || [])
      .filter(Boolean)
      .sort((left, right) => left.getTime() - right.getTime());

    const count = completions.length;
    if (count < limit) {
      stateByOwner.set(ownerKey, {
        count,
        blocked: false,
        retryAt: null,
      });
      continue;
    }

    const releaseIndex = Math.max(0, count - limit);
    const releaseSource = completions[releaseIndex];
    const retryAt = getGiftLimitRetryAt(releaseSource);
    const blocked = retryAt > now;

    stateByOwner.set(ownerKey, {
      count,
      blocked,
      retryAt: blocked ? retryAt : null,
    });
  }

  return stateByOwner;
};

export const attachViewerRequestState = async (items, viewerId) => {
  if (!Array.isArray(items) || !items.length) return items;

  if (!viewerId) {
    return items.map((item) => ({
      ...item,
      myRequestStatus: null,
      myRequestId: null,
      canCreateRequest: null,
      requestBlockReason: null,
    }));
  }

  const itemIds = items
    .map((item) => item?._id || item?.id)
    .filter(Boolean)
    .map((id) => id.toString());

  if (!itemIds.length) return items;

  const latestRequests = await ItemRequest.find({
    requesterId: viewerId,
    itemId: { $in: itemIds },
    status: { $in: ALL_REQUEST_STATUSES },
  })
    .sort({ createdAt: -1, _id: -1 })
    .select("_id itemId status createdAt")
    .lean();

  const latestByItemId = new Map();
  for (const request of latestRequests) {
    const key = request.itemId?.toString?.();
    if (!key || latestByItemId.has(key)) continue;
    latestByItemId.set(key, {
      id: request._id?.toString?.() || null,
      status: request.status || null,
    });
  }

  const ownerIdsForPolicy = Array.from(
    new Set(
      items
        .filter(
          (item) =>
            item?.mode === "GIFT" &&
            item?.ownerId &&
            item.ownerId.toString() !== viewerId.toString()
        )
        .map((item) => item.ownerId.toString())
    )
  );

  const ownerPolicyState = new Map();
  if (ownerIdsForPolicy.length) {
    const now = new Date();
    const windowStart = getGiftLimitWindowStart(now);
    const [recentGiftTransactions, recentGiftRequests] = await Promise.all([
      ItemTransaction.find({
        type: "GIFT",
        receiverId: viewerId,
        ownerId: { $in: ownerIdsForPolicy },
        completedAt: { $gt: windowStart },
      })
        .sort({ completedAt: 1, _id: 1 })
        .select("_id requestId ownerId completedAt")
        .lean(),
      ItemRequest.find({
        type: "GIFT",
        status: "COMPLETED",
        requesterId: viewerId,
        ownerId: { $in: ownerIdsForPolicy },
        completedAt: { $gt: windowStart },
      })
        .sort({ completedAt: 1, _id: 1 })
        .select("_id ownerId completedAt")
        .lean(),
    ]);

    const derivedState = deriveGiftPolicyOwnerState({
      now,
      transactionRows: recentGiftTransactions,
      requestRows: recentGiftRequests,
      limit: GIFT_LIMIT_PER_WINDOW,
    });

    for (const [ownerKey, state] of derivedState.entries()) {
      ownerPolicyState.set(ownerKey, state);
    }
  }

  return items.map((item) => {
    const itemKey = item?._id?.toString?.() || item?.id?.toString?.();
    const ownerKey = item?.ownerId?.toString?.();
    const myRequest = itemKey ? latestByItemId.get(itemKey) || null : null;
    const policyState = ownerPolicyState.get(ownerKey) || null;
    const blockedByPolicy = Boolean(
      item?.mode === "GIFT" && ownerKey && policyState?.blocked
    );

    const availability = resolveViewerRequestState({
      viewerId,
      itemStatus: item?.status,
      itemOwnerId: ownerKey,
      myRequestStatus: myRequest?.status || null,
      blockedByPolicy,
    });

    if (
      shouldDebugRequestGuard({
        viewerId,
        itemId: itemKey,
      })
    ) {
      logger.info(
        {
          viewerId: String(viewerId),
          itemId: itemKey,
          ownerId: ownerKey || null,
          itemStatus: item?.status || null,
          myRequestStatus: myRequest?.status || null,
          policy: {
            limit: GIFT_LIMIT_PER_WINDOW,
            ownerGiftCountInWindow: policyState?.count || 0,
            blockedByPolicy,
            retryAt: policyState?.retryAt
              ? policyState.retryAt.toISOString()
              : null,
          },
          decision: availability,
        },
        "Request guard decision"
      );
    }

    return {
      ...item,
      myRequestStatus: myRequest?.status || null,
      myRequestId: myRequest?.id || null,
      canCreateRequest: availability.canCreateRequest,
      requestBlockReason: availability.requestBlockReason,
    };
  });
};
