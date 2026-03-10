import "dotenv/config";

import app from "./app.js";
import { connectDB } from "./config/db.js";
import { validateEnv } from "./config/env.js";
import logger from "./utils/logger.js";
import { runStartupMaintenance } from "./startup/startup-maintenance.js";

validateEnv();
await connectDB();
await runStartupMaintenance();

app.listen(process.env.PORT, () => {
  logger.info(`🚀 Server running on http://localhost:${process.env.PORT}`);
});
