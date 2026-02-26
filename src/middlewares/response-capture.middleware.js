import { patchJsonResponseCapture } from "../utils/responseCapture.js";

export const responseCaptureMiddleware = (req, res, next) => {
  patchJsonResponseCapture(res);
  next();
};
