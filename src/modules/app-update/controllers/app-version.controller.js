import {
  getAdminAppVersionConfig,
  getPublicAppVersion,
  upsertAdminAppVersionConfig,
} from "../services/app-version.service.js";
import {
  appVersionAdminPatchSchema,
  appVersionQuerySchema,
} from "../validators/app-version.validators.js";

export const getPublicAppVersionHandler = async (req, res, next) => {
  try {
    const query = appVersionQuerySchema.parse(req.query || {});
    const data = await getPublicAppVersion(query);
    res.status(200).json({
      success: true,
      ...data,
    });
  } catch (err) {
    next(err);
  }
};

export const getAdminAppVersionConfigHandler = async (req, res, next) => {
  try {
    const config = await getAdminAppVersionConfig();
    res.status(200).json({
      success: true,
      config,
    });
  } catch (err) {
    next(err);
  }
};

export const upsertAdminAppVersionConfigHandler = async (req, res, next) => {
  try {
    const payload = appVersionAdminPatchSchema.parse(req.body || {});
    const config = await upsertAdminAppVersionConfig(payload);
    res.status(200).json({
      success: true,
      message: "App version config updated",
      config,
    });
  } catch (err) {
    next(err);
  }
};
