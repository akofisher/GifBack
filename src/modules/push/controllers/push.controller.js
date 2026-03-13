import { registerPushTokenSchema } from "../validators/push.validators.js";
import {
  registerPushToken,
  removePushTokenByDevice,
} from "../services/push.service.js";

export const registerPushTokenHandler = async (req, res, next) => {
  try {
    const payload = registerPushTokenSchema.parse(req.body || {});
    const token = await registerPushToken({
      userId: req.user.id,
      token: payload.token,
      deviceId: payload.deviceId,
      platform: payload.platform || "unknown",
      appVersion: payload.appVersion || "",
      locale: payload.locale || req.user.lang || "",
    });

    res.status(200).json({
      success: true,
      token,
    });
  } catch (error) {
    next(error);
  }
};

export const removePushTokenByDeviceHandler = async (req, res, next) => {
  try {
    const result = await removePushTokenByDevice({
      userId: req.user.id,
      deviceId: req.params.deviceId,
    });

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};
