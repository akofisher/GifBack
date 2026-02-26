import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import { connectDB } from "./config/db.js";
import { validateEnv } from "./config/env.js";
import logger from "./utils/logger.js";

validateEnv();
await connectDB();

app.listen(process.env.PORT, () => {
  logger.info(`🚀 Server running on http://localhost:${process.env.PORT}`);
});
