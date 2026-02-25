import { badRequest } from "../../../utils/appError.js";
import AppVersion from "../models/app-version.model.js";

const APP_VERSION_KEY = "mobile-app";
const VERSION_REGEX = /^\d+(?:\.\d+){1,3}$/;

const normalizeVersion = (version) => String(version || "").trim();

const isValidVersion = (version) => VERSION_REGEX.test(normalizeVersion(version));

const parseVersion = (version) => normalizeVersion(version).split(".").map(Number);

export const compareVersions = (leftVersion, rightVersion) => {
  if (!isValidVersion(leftVersion) || !isValidVersion(rightVersion)) {
    throw badRequest("Validation error", "VALIDATION_ERROR", [
      { field: "version", message: "Invalid version format" },
    ]);
  }

  const left = parseVersion(leftVersion);
  const right = parseVersion(rightVersion);
  const maxLength = Math.max(left.length, right.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = left[index] || 0;
    const rightValue = right[index] || 0;
    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }

  return 0;
};

const buildDefaultConfig = () => {
  const androidLatest = normalizeVersion(
    process.env.APP_ANDROID_LATEST_VERSION || "1.0.0"
  );
  const iosLatest = normalizeVersion(process.env.APP_IOS_LATEST_VERSION || "1.0.0");

  const androidMin = normalizeVersion(
    process.env.APP_ANDROID_MIN_VERSION || androidLatest
  );
  const iosMin = normalizeVersion(process.env.APP_IOS_MIN_VERSION || iosLatest);

  return {
    key: APP_VERSION_KEY,
    android: {
      latestVersion: isValidVersion(androidLatest) ? androidLatest : "1.0.0",
      minSupportedVersion: isValidVersion(androidMin) ? androidMin : "1.0.0",
      storeUrl: String(process.env.APP_ANDROID_STORE_URL || "").trim(),
    },
    ios: {
      latestVersion: isValidVersion(iosLatest) ? iosLatest : "1.0.0",
      minSupportedVersion: isValidVersion(iosMin) ? iosMin : "1.0.0",
      storeUrl: String(process.env.APP_IOS_STORE_URL || "").trim(),
    },
    updateMessage: String(
      process.env.APP_UPDATE_MESSAGE ||
        "A new app version is available. Please update the app."
    ).trim(),
    isEnabled: true,
  };
};

const formatConfig = (configDoc) => ({
  key: configDoc.key,
  android: {
    latestVersion: configDoc.android.latestVersion,
    minSupportedVersion: configDoc.android.minSupportedVersion,
    storeUrl: configDoc.android.storeUrl || "",
  },
  ios: {
    latestVersion: configDoc.ios.latestVersion,
    minSupportedVersion: configDoc.ios.minSupportedVersion,
    storeUrl: configDoc.ios.storeUrl || "",
  },
  updateMessage: configDoc.updateMessage || "",
  isEnabled: Boolean(configDoc.isEnabled),
  createdAt: configDoc.createdAt,
  updatedAt: configDoc.updatedAt,
});

const validatePlatformVersions = (platformName, platformConfig) => {
  const latestVersion = normalizeVersion(platformConfig.latestVersion);
  const minSupportedVersion = normalizeVersion(platformConfig.minSupportedVersion);

  if (!isValidVersion(latestVersion)) {
    throw badRequest("Validation error", "VALIDATION_ERROR", [
      {
        field: `${platformName}.latestVersion`,
        message: "Version must be numeric dot format, e.g. 1.0.1",
      },
    ]);
  }

  if (!isValidVersion(minSupportedVersion)) {
    throw badRequest("Validation error", "VALIDATION_ERROR", [
      {
        field: `${platformName}.minSupportedVersion`,
        message: "Version must be numeric dot format, e.g. 1.0.0",
      },
    ]);
  }

  if (compareVersions(minSupportedVersion, latestVersion) > 0) {
    throw badRequest("Validation error", "VALIDATION_ERROR", [
      {
        field: `${platformName}.minSupportedVersion`,
        message: "minSupportedVersion cannot be greater than latestVersion",
      },
    ]);
  }
};

const ensureSingletonConfig = async () => {
  const existing = await AppVersion.findOne({ key: APP_VERSION_KEY });
  if (existing) return existing;

  try {
    const created = await AppVersion.create(buildDefaultConfig());
    validatePlatformVersions("android", created.android);
    validatePlatformVersions("ios", created.ios);
    return created;
  } catch (err) {
    if (err?.code === 11000) {
      return AppVersion.findOne({ key: APP_VERSION_KEY });
    }
    throw err;
  }
};

export const getAdminAppVersionConfig = async () => {
  const config = await ensureSingletonConfig();
  return formatConfig(config);
};

const applyPlatformPatch = (target, patch) => {
  if (!patch) return;

  if (patch.latestVersion !== undefined) {
    target.latestVersion = normalizeVersion(patch.latestVersion);
  }
  if (patch.minSupportedVersion !== undefined) {
    target.minSupportedVersion = normalizeVersion(patch.minSupportedVersion);
  }
  if (patch.storeUrl !== undefined) {
    target.storeUrl = String(patch.storeUrl || "").trim();
  }
};

export const upsertAdminAppVersionConfig = async (payload) => {
  const config = await ensureSingletonConfig();

  applyPlatformPatch(config.android, payload.android);
  applyPlatformPatch(config.ios, payload.ios);

  if (payload.updateMessage !== undefined) {
    config.updateMessage = String(payload.updateMessage || "").trim();
  }
  if (payload.isEnabled !== undefined) {
    config.isEnabled = Boolean(payload.isEnabled);
  }

  validatePlatformVersions("android", config.android);
  validatePlatformVersions("ios", config.ios);

  await config.save();
  return formatConfig(config);
};

const buildPlatformCheck = ({ platform, currentVersion, config }) => {
  const platformConfig = platform === "ios" ? config.ios : config.android;

  const hasCurrentVersion = isValidVersion(currentVersion);
  const requiresUpdate =
    Boolean(config.isEnabled) &&
    hasCurrentVersion &&
    compareVersions(currentVersion, platformConfig.latestVersion) < 0;
  const forceUpdate =
    Boolean(config.isEnabled) &&
    hasCurrentVersion &&
    compareVersions(currentVersion, platformConfig.minSupportedVersion) < 0;

  return {
    platform,
    currentVersion: hasCurrentVersion ? normalizeVersion(currentVersion) : null,
    latestVersion: platformConfig.latestVersion,
    minSupportedVersion: platformConfig.minSupportedVersion,
    storeUrl: platformConfig.storeUrl || "",
    updateMessage: config.updateMessage || "",
    isEnabled: Boolean(config.isEnabled),
    requiresUpdate: forceUpdate ? true : requiresUpdate,
    forceUpdate,
  };
};

export const getPublicAppVersion = async ({ platform, currentVersion } = {}) => {
  const configDoc = await ensureSingletonConfig();
  const config = formatConfig(configDoc);

  if (!platform) {
    return { config };
  }

  const check = buildPlatformCheck({
    platform,
    currentVersion,
    config,
  });

  return {
    config,
    check,
  };
};
