import "dotenv/config";
import mongoose from "mongoose";

import { fixMarketplaceRequestIndexes } from "../src/modules/marketplace/services/marketplace-maintenance.service.js";

const run = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not set");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const result = await fixMarketplaceRequestIndexes();
  console.log(
    JSON.stringify(
      {
        success: true,
        ...result,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("Request index fix failed", err);
  process.exit(1);
});
