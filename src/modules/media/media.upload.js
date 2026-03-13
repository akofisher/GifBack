import multer from "multer";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MEDIA_MAX_UPLOAD_BYTES,
} from "../../config/media.js";
import { badRequest } from "../../utils/appError.js";

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: MEDIA_MAX_UPLOAD_BYTES,
    files: 10,
  },
  fileFilter: (req, file, callback) => {
    const mimeType = String(file?.mimetype || "").toLowerCase();
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
      callback(
        badRequest("Validation error", "INVALID_MEDIA_MIME_TYPE", [
          { field: "file", message: "Only jpg, jpeg, png, webp are supported" },
        ])
      );
      return;
    }

    callback(null, true);
  },
});

const mapMulterError = (error) => {
  if (!(error instanceof multer.MulterError)) return error;

  if (error.code === "LIMIT_FILE_SIZE") {
    return badRequest("Validation error", "MEDIA_FILE_TOO_LARGE", [
      { field: "file", message: `Max file size is ${MEDIA_MAX_UPLOAD_BYTES} bytes` },
    ]);
  }

  if (error.code === "LIMIT_FILE_COUNT") {
    return badRequest("Validation error", "MEDIA_TOO_MANY_FILES", [
      { field: "files", message: "Too many files uploaded" },
    ]);
  }

  return badRequest("Validation error", "MEDIA_UPLOAD_INVALID", [
    { field: "file", message: error.message || "Invalid upload payload" },
  ]);
};

const runUploadMiddleware = (middleware) => (req, res, next) => {
  middleware(req, res, (error) => {
    if (!error) {
      next();
      return;
    }
    next(mapMulterError(error));
  });
};

export const uploadMediaFilesMiddleware = runUploadMiddleware(
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "files", maxCount: 10 },
  ])
);
