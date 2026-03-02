import "dotenv/config";
import mongoose from "mongoose";

import {
  backfillMarketplaceTransactionsFromCompletedRequests,
  recalculateMarketplaceUserStats,
  reconcileMarketplacePendingRequestCounts,
} from "../src/modules/marketplace/services/marketplace-maintenance.service.js";

const run = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not set");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const txBackfill = await backfillMarketplaceTransactionsFromCompletedRequests();
  const statsBackfill = await recalculateMarketplaceUserStats();
  const pendingBackfill = await reconcileMarketplacePendingRequestCounts();

  console.log(
    JSON.stringify(
      {
        success: true,
        processedCompletedRequests: txBackfill.processed,
        insertedMissingTransactions: txBackfill.upserted,
        updatedUsers: statsBackfill.updatedUsers,
        updatedPendingRequestCounts: pendingBackfill.updatedItems,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("Backfill failed", err);
  process.exit(1);
});
