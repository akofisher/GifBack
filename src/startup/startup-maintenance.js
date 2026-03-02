import logger from "../utils/logger.js";
import { runMarketplaceStartupMaintenance } from "../modules/marketplace/services/marketplace-maintenance.service.js";

const parseBooleanEnv = (value, defaultValue) => {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;

  return defaultValue;
};

const parsePositiveIntEnv = (value, defaultValue) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  return Math.floor(parsed);
};

export const runStartupMaintenance = async () => {
  const enabled = parseBooleanEnv(
    process.env.STARTUP_MAINTENANCE_ENABLED,
    true
  );
  if (!enabled) {
    return null;
  }

  const strictMode = parseBooleanEnv(
    process.env.STARTUP_MAINTENANCE_STRICT,
    false
  );
  const batchSize = parsePositiveIntEnv(
    process.env.STARTUP_MAINTENANCE_BATCH_SIZE,
    1000
  );

  try {
    return await runMarketplaceStartupMaintenance({
      batchSize,
      continueOnError: !strictMode,
    });
  } catch (err) {
    logger.error(
      { err, strictMode },
      "Startup maintenance failed"
    );

    if (strictMode) {
      throw err;
    }

    logger.warn("Continuing server startup without maintenance strict mode");
    return null;
  }
};
