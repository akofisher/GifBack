import "dotenv/config";
import mongoose from "mongoose";

import User from "../src/modules/user/models/user.model.js";
import Item from "../src/modules/marketplace/models/item.model.js";
import ItemTransaction from "../src/modules/marketplace/models/transaction.model.js";

const toKey = (id) => id?.toString();

const run = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not set");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const [itemsAgg, giftsAgg, exchangesAgg, users] = await Promise.all([
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
      { $group: { _id: "$ownerId", given: { $sum: 1 } } },
    ]),
    ItemTransaction.aggregate([
      { $match: { type: "EXCHANGE" } },
      { $project: { owners: ["$ownerAId", "$ownerBId"] } },
      { $unwind: "$owners" },
      { $match: { owners: { $ne: null } } },
      { $group: { _id: "$owners", exchanged: { $sum: 1 } } },
    ]),
    User.find({}, { _id: 1 }).lean(),
  ]);

  const itemsMap = new Map(itemsAgg.map((d) => [toKey(d._id), d]));
  const giftsMap = new Map(giftsAgg.map((d) => [toKey(d._id), d]));
  const exchangesMap = new Map(exchangesAgg.map((d) => [toKey(d._id), d]));

  const updates = users.map((u) => {
    const key = toKey(u._id);
    const items = itemsMap.get(key);
    const gifts = giftsMap.get(key);
    const exchanges = exchangesMap.get(key);

    return {
      updateOne: {
        filter: { _id: u._id },
        update: {
          $set: {
            "stats.giving": items?.giving || 0,
            "stats.exchanging": items?.exchanging || 0,
            "stats.given": gifts?.given || 0,
            "stats.exchanged": exchanges?.exchanged || 0,
          },
        },
      },
    };
  });

  if (updates.length) {
    await User.bulkWrite(updates);
  }

  await mongoose.disconnect();
  console.log(`✅ Recalculated stats for ${users.length} users`);
};

run().catch((err) => {
  console.error("❌ Failed to recalculate stats", err);
  process.exit(1);
});
