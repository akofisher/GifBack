import "dotenv/config";
import mongoose from "mongoose";

import User from "../src/modules/user/models/user.model.js";
import Item from "../src/modules/marketplace/models/item.model.js";
import ItemRequest from "../src/modules/marketplace/models/request.model.js";
import ItemTransaction from "../src/modules/marketplace/models/transaction.model.js";

const shouldFix = process.argv.includes("--fix");

const toKey = (value) => value?.toString?.();

const buildExpectedUserStats = async () => {
  const [activeItems, gifts, exchanges] = await Promise.all([
    Item.aggregate([
      { $match: { status: "ACTIVE" } },
      {
        $group: {
          _id: "$ownerId",
          giving: {
            $sum: { $cond: [{ $eq: ["$mode", "GIFT"] }, 1, 0] },
          },
          exchanging: {
            $sum: { $cond: [{ $eq: ["$mode", "EXCHANGE"] }, 1, 0] },
          },
        },
      },
    ]),
    ItemTransaction.aggregate([
      { $match: { type: "GIFT" } },
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
  ]);

  const map = new Map();

  const ensureEntry = (id) => {
    const key = toKey(id);
    if (!key) return null;
    if (!map.has(key)) {
      map.set(key, {
        giving: 0,
        exchanging: 0,
        given: 0,
        exchanged: 0,
      });
    }
    return map.get(key);
  };

  for (const row of activeItems) {
    const entry = ensureEntry(row._id);
    if (!entry) continue;
    entry.giving = row.giving || 0;
    entry.exchanging = row.exchanging || 0;
  }

  for (const row of gifts) {
    const entry = ensureEntry(row._id);
    if (!entry) continue;
    entry.given = row.given || 0;
  }

  for (const row of exchanges) {
    const entry = ensureEntry(row._id);
    if (!entry) continue;
    entry.exchanged = row.exchanged || 0;
  }

  return map;
};

const checkUserStats = async () => {
  const expectedMap = await buildExpectedUserStats();
  const users = await User.find({}, { _id: 1, stats: 1 }).lean();

  const mismatches = [];
  const updates = [];

  for (const user of users) {
    const key = toKey(user._id);
    const expected = expectedMap.get(key) || {
      giving: 0,
      exchanging: 0,
      given: 0,
      exchanged: 0,
    };
    const actual = {
      giving: user.stats?.giving || 0,
      exchanging: user.stats?.exchanging || 0,
      given: user.stats?.given || 0,
      exchanged: user.stats?.exchanged || 0,
    };

    if (
      actual.giving !== expected.giving ||
      actual.exchanging !== expected.exchanging ||
      actual.given !== expected.given ||
      actual.exchanged !== expected.exchanged
    ) {
      mismatches.push({
        userId: key,
        actual,
        expected,
      });

      updates.push({
        updateOne: {
          filter: { _id: user._id },
          update: {
            $set: {
              "stats.giving": expected.giving,
              "stats.exchanging": expected.exchanging,
              "stats.given": expected.given,
              "stats.exchanged": expected.exchanged,
            },
          },
        },
      });
    }
  }

  if (shouldFix && updates.length) {
    await User.bulkWrite(updates);
  }

  return {
    totalUsers: users.length,
    mismatches,
    fixed: shouldFix ? updates.length : 0,
  };
};

const checkPendingRequestCounts = async () => {
  const [items, pendingCounts] = await Promise.all([
    Item.find({}, { _id: 1, pendingRequestsCount: 1 }).lean(),
    ItemRequest.aggregate([
      { $match: { status: "PENDING" } },
      { $group: { _id: "$itemId", count: { $sum: 1 } } },
    ]),
  ]);

  const expectedByItem = new Map(
    pendingCounts.map((row) => [toKey(row._id), row.count || 0])
  );

  const mismatches = [];
  const updates = [];

  for (const item of items) {
    const key = toKey(item._id);
    const expected = expectedByItem.get(key) || 0;
    const actual = item.pendingRequestsCount || 0;

    if (actual !== expected) {
      mismatches.push({ itemId: key, actual, expected });
      updates.push({
        updateOne: {
          filter: { _id: item._id },
          update: { $set: { pendingRequestsCount: expected } },
        },
      });
    }
  }

  if (shouldFix && updates.length) {
    await Item.bulkWrite(updates);
  }

  return {
    totalItems: items.length,
    mismatches,
    fixed: shouldFix ? updates.length : 0,
  };
};

const checkActiveRequestDuplicates = async () => {
  const duplicates = await ItemRequest.aggregate([
    { $match: { status: { $in: ["PENDING", "APPROVED"] } } },
    {
      $group: {
        _id: {
          requesterId: "$requesterId",
          itemId: "$itemId",
        },
        ids: { $push: "$_id" },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
  ]);

  return duplicates.map((entry) => ({
    requesterId: toKey(entry._id.requesterId),
    itemId: toKey(entry._id.itemId),
    count: entry.count,
    requestIds: (entry.ids || []).map((id) => toKey(id)),
  }));
};

const checkReservedLinks = async () => {
  const reservedItems = await Item.find(
    { status: "RESERVED" },
    { _id: 1, reservedByRequestId: 1 }
  ).lean();

  const issues = [];

  for (const item of reservedItems) {
    if (!item.reservedByRequestId) {
      issues.push({
        itemId: toKey(item._id),
        reason: "RESERVED_WITHOUT_REQUEST",
      });
      continue;
    }

    const request = await ItemRequest.findById(item.reservedByRequestId)
      .select("_id status")
      .lean();

    if (!request) {
      issues.push({
        itemId: toKey(item._id),
        reservedByRequestId: toKey(item.reservedByRequestId),
        reason: "RESERVED_REQUEST_MISSING",
      });
      continue;
    }

    if (request.status !== "APPROVED") {
      issues.push({
        itemId: toKey(item._id),
        reservedByRequestId: toKey(item.reservedByRequestId),
        requestStatus: request.status,
        reason: "RESERVED_REQUEST_NOT_APPROVED",
      });
    }
  }

  return issues;
};

const run = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not set");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const [statsResult, pendingResult, duplicates, reservedIssues] = await Promise.all([
    checkUserStats(),
    checkPendingRequestCounts(),
    checkActiveRequestDuplicates(),
    checkReservedLinks(),
  ]);

  const summary = {
    mode: shouldFix ? "CHECK_AND_FIX" : "CHECK_ONLY",
    userStats: {
      totalUsers: statsResult.totalUsers,
      mismatches: statsResult.mismatches.length,
      fixed: statsResult.fixed,
    },
    pendingRequestCounts: {
      totalItems: pendingResult.totalItems,
      mismatches: pendingResult.mismatches.length,
      fixed: pendingResult.fixed,
    },
    activeRequestDuplicates: duplicates.length,
    reservedLinkIssues: reservedIssues.length,
  };

  console.log("=== Marketplace Integrity Summary ===");
  console.log(JSON.stringify(summary, null, 2));

  if (statsResult.mismatches.length) {
    console.log("\nUser stats mismatches:");
    console.log(JSON.stringify(statsResult.mismatches.slice(0, 20), null, 2));
  }

  if (pendingResult.mismatches.length) {
    console.log("\nPending request count mismatches:");
    console.log(JSON.stringify(pendingResult.mismatches.slice(0, 20), null, 2));
  }

  if (duplicates.length) {
    console.log("\nActive duplicate requests:");
    console.log(JSON.stringify(duplicates.slice(0, 20), null, 2));
  }

  if (reservedIssues.length) {
    console.log("\nReserved item issues:");
    console.log(JSON.stringify(reservedIssues.slice(0, 20), null, 2));
  }

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("Integrity check failed", err);
  process.exit(1);
});
