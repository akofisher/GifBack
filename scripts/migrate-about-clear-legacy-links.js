import "dotenv/config";
import mongoose from "mongoose";
import About from "../src/modules/about/models/about.model.js";

const run = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not set");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const result = await About.updateMany(
    {},
    {
      $unset: {
        facebookLink: 1,
        instagramLink: 1,
        linkedinLink: 1,
        tiktokLink: 1,
        youtubeLink: 1,
      },
    }
  );

  console.log(
    JSON.stringify(
      {
        success: true,
        matched: result.matchedCount || 0,
        modified: result.modifiedCount || 0,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("❌ Failed to clear legacy about links", err);
  process.exit(1);
});
