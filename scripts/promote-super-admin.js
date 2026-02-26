import "dotenv/config";
import mongoose from "mongoose";

import User from "../src/modules/user/models/user.model.js";

const emailArg = process.argv[2];

const run = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not set");
  }

  if (!emailArg) {
    throw new Error("Usage: node scripts/promote-super-admin.js <email>");
  }

  const email = emailArg.toLowerCase().trim();

  await mongoose.connect(process.env.MONGO_URI);

  const user = await User.findOne({ email });
  if (!user) {
    throw new Error(`User not found: ${email}`);
  }

  user.role = "super_admin";
  user.isActive = true;
  user.emailVerified = true;
  await user.save();

  console.log(
    JSON.stringify(
      {
        success: true,
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          isActive: user.isActive,
        },
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error("Failed to promote super admin", err.message || err);
  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }
  process.exit(1);
});
