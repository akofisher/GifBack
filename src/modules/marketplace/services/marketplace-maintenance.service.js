import Item from "../models/item.model.js";
import ItemRequest from "../models/request.model.js";
import ItemTransaction from "../models/transaction.model.js";
import User from "../../user/models/user.model.js";

const LEGACY_GIFT_PAIR_INDEX = "ownerId_1_requesterId_1_type_1";
const DEFAULT_BATCH_SIZE = 1000;

export const fixMarketplaceRequestIndexes = async () => {
  const existingIndexes = await ItemRequest.collection.indexes();
  const hasLegacyIndex = existingIndexes.some(
    (index) => index.name === LEGACY_GIFT_PAIR_INDEX
  );

  if (hasLegacyIndex) {
    await ItemRequest.collection.dropIndex(LEGACY_GIFT_PAIR_INDEX);
  }

  await ItemRequest.syncIndexes();

  const updatedIndexes = await ItemRequest.collection.indexes();

  return {
    droppedLegacyGiftPairIndex: hasLegacyIndex,
    indexCount: updatedIndexes.length,
  };
};

export const backfillMarketplaceTransactionsFromCompletedRequests = async ({
  batchSize = DEFAULT_BATCH_SIZE,
} = {}) => {
  const cursor = ItemRequest.find({ status: "COMPLETED" })
    .select(
      "_id type itemId offeredItemId ownerId requesterId completedAt updatedAt createdAt itemSnapshot offeredItemSnapshot"
    )
    .lean()
    .cursor();

  let processed = 0;
  let upserted = 0;
  let operations = [];

  for await (const request of cursor) {
    const completedAt =
      request.completedAt || request.updatedAt || request.createdAt || new Date();

    if (request.type === "GIFT") {
      operations.push({
        updateOne: {
          filter: { requestId: request._id },
          update: {
            $setOnInsert: {
              type: "GIFT",
              requestId: request._id,
              itemId: request.itemId || null,
              ownerId: request.ownerId || null,
              receiverId: request.requesterId || null,
              itemSnapshot: request.itemSnapshot || { title: "", imageUrl: "" },
              offeredItemSnapshot:
                request.offeredItemSnapshot || { title: "", imageUrl: "" },
              completedAt,
            },
          },
          upsert: true,
        },
      });
    } else if (request.type === "EXCHANGE") {
      operations.push({
        updateOne: {
          filter: { requestId: request._id },
          update: {
            $setOnInsert: {
              type: "EXCHANGE",
              requestId: request._id,
              itemAId: request.itemId || null,
              ownerAId: request.ownerId || null,
              itemBId: request.offeredItemId || null,
              ownerBId: request.requesterId || null,
              itemSnapshot: request.itemSnapshot || { title: "", imageUrl: "" },
              offeredItemSnapshot:
                request.offeredItemSnapshot || { title: "", imageUrl: "" },
              completedAt,
            },
          },
          upsert: true,
        },
      });
    }

    processed += 1;

    if (operations.length >= batchSize) {
      const result = await ItemTransaction.bulkWrite(operations, { ordered: false });
      upserted += result.upsertedCount || 0;
      operations = [];
    }
  }

  if (operations.length) {
    const result = await ItemTransaction.bulkWrite(operations, { ordered: false });
    upserted += result.upsertedCount || 0;
  }

  return { processed, upserted };
};

export const recalculateMarketplaceUserStats = async () => {
  const [activeItems, gifts, exchanges, users] = await Promise.all([
    Item.aggregate([
      { $match: { status: "ACTIVE" } },
      {
        $group: {
          _id: "$ownerId",
          giving: { $sum: { $cond: [{ $eq: ["$mode", "GIFT"] }, 1, 0] } },
          exchanging: {
            $sum: { $cond: [{ $eq: ["$mode", "EXCHANGE"] }, 1, 0] },
          },
        },
      },
    ]),
    ItemTransaction.aggregate([
      { $match: { type: "GIFT", ownerId: { $ne: null } } },
      {
        $group: {
          _id: "$ownerId",
          given: { $sum: 1 },
        },
      },
    ]),
    ItemTransaction.aggregate([
      { $match: { type: "EXCHANGE" } },
      { $project: { owners: ["$ownerAId", "$ownerBId"] } },
      { $unwind: "$owners" },
      { $match: { owners: { $ne: null } } },
      {
        $group: {
          _id: "$owners",
          exchanged: { $sum: 1 },
        },
      },
    ]),
    User.find({}, { _id: 1 }).lean(),
  ]);

  const byUserId = new Map();
  const ensure = (id) => {
    const key = id?.toString?.();
    if (!key) return null;
    if (!byUserId.has(key)) {
      byUserId.set(key, {
        giving: 0,
        exchanging: 0,
        given: 0,
        exchanged: 0,
      });
    }
    return byUserId.get(key);
  };

  for (const row of activeItems) {
    const entry = ensure(row._id);
    if (!entry) continue;
    entry.giving = row.giving || 0;
    entry.exchanging = row.exchanging || 0;
  }

  for (const row of gifts) {
    const entry = ensure(row._id);
    if (!entry) continue;
    entry.given = row.given || 0;
  }

  for (const row of exchanges) {
    const entry = ensure(row._id);
    if (!entry) continue;
    entry.exchanged = row.exchanged || 0;
  }

  const updates = users.map((user) => {
    const key = user._id.toString();
    const stats = byUserId.get(key) || {
      giving: 0,
      exchanging: 0,
      given: 0,
      exchanged: 0,
    };
    return {
      updateOne: {
        filter: { _id: user._id },
        update: {
          $set: {
            "stats.giving": stats.giving,
            "stats.exchanging": stats.exchanging,
            "stats.given": stats.given,
            "stats.exchanged": stats.exchanged,
          },
        },
      },
    };
  });

  if (updates.length) {
    await User.bulkWrite(updates);
  }

  return { updatedUsers: updates.length };
};

export const reconcileMarketplacePendingRequestCounts = async () => {
  const [items, pendingCounts] = await Promise.all([
    Item.find({}, { _id: 1, pendingRequestsCount: 1 }).lean(),
    ItemRequest.aggregate([
      { $match: { status: "PENDING" } },
      { $group: { _id: "$itemId", count: { $sum: 1 } } },
    ]),
  ]);

  const expectedByItem = new Map(
    pendingCounts.map((row) => [row._id?.toString?.(), row.count || 0])
  );

  const updates = [];
  for (const item of items) {
    const itemId = item._id?.toString?.();
    if (!itemId) continue;

    const expected = expectedByItem.get(itemId) || 0;
    const actual = item.pendingRequestsCount || 0;
    if (actual === expected) continue;

    updates.push({
      updateOne: {
        filter: { _id: item._id },
        update: { $set: { pendingRequestsCount: expected } },
      },
    });
  }

  if (updates.length) {
    await Item.bulkWrite(updates);
  }

  return {
    totalItems: items.length,
    updatedItems: updates.length,
  };
};

export const runMarketplaceStartupMaintenance = async ({
  batchSize = DEFAULT_BATCH_SIZE,
  continueOnError = false,
} = {}) => {
  const summary = {};

  const runStep = async (key, execute) => {
    try {
      summary[key] = {
        success: true,
        result: await execute(),
      };
    } catch (err) {
      summary[key] = {
        success: false,
        message: err?.message || "Unknown maintenance error",
      };

      if (!continueOnError) {
        throw err;
      }
    }
  };

  await runStep("indexes", () => fixMarketplaceRequestIndexes());
  await runStep("transactions", () =>
    backfillMarketplaceTransactionsFromCompletedRequests({ batchSize })
  );
  await runStep("userStats", () => recalculateMarketplaceUserStats());
  await runStep("pendingRequestCounts", () =>
    reconcileMarketplacePendingRequestCounts()
  );

  return summary;
};
