import { AppError, badRequest } from "../utils/appError.js";
import logger from "../utils/logger.js";

const formatZodError = (err) =>
  new AppError(
    "Validation error",
    400,
    "VALIDATION_ERROR",
    err.errors?.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }))
  );

const formatMongooseValidation = (err) =>
  new AppError(
    "Validation error",
    400,
    "MONGOOSE_VALIDATION_ERROR",
    Object.values(err.errors || {}).map((e) => ({
      field: e.path,
      message: e.message,
    }))
  );

const formatDuplicateKey = (err) => {
  const fields = Object.keys(err.keyValue || {});
  const normalized = fields.length ? fields : ["field"];

  const errors = normalized.map((field) => ({
    field,
    message:
      field === "email"
        ? "Email already in use"
        : field === "phone"
          ? "Phone already in use"
          : "Duplicate value",
  }));

  const message =
    normalized.includes("email") && normalized.includes("phone")
      ? "Email and phone already in use"
      : errors[0].message;

  return new AppError(message, 409, "DUPLICATE_KEY", errors);
};

const formatJwtError = (err) => {
  if (err?.name === "TokenExpiredError") {
    return new AppError("Token expired", 401, "TOKEN_EXPIRED");
  }
  return new AppError("Invalid token", 401, "INVALID_TOKEN");
};

const normalizeError = (err) => {
  if (err instanceof AppError) return err;

  if (err?.name === "ZodError") return formatZodError(err);
  if (err?.name === "ValidationError") return formatMongooseValidation(err);
  if (err?.code === 11000) return formatDuplicateKey(err);
  if (err?.name === "CastError") {
    return new AppError("Invalid id", 400, "INVALID_ID", [
      { field: err.path },
    ]);
  }
  if (
    err?.name === "JsonWebTokenError" ||
    err?.name === "TokenExpiredError" ||
    err?.name === "NotBeforeError"
  ) {
    return formatJwtError(err);
  }
  if (err?.type === "entity.parse.failed") {
    return badRequest("Invalid JSON body", "INVALID_JSON");
  }

  if (err?.status && err?.message) {
    return new AppError(
      err.message,
      err.status,
      err.code || `HTTP_${err.status}`,
      err.details
    );
  }

  return new AppError("Internal Server Error", 500, "INTERNAL_ERROR");
};

export const errorHandler = (err, req, res, next) => {
  const normalized = normalizeError(err);
  const status = normalized.status || 500;

  if (status >= 500) {
    logger.error({ err }, "Unhandled error");
  }

  const payload = {
    success: false,
    message: normalized.message,
    code: normalized.code,
  };

  if (normalized.details && normalized.details.length) {
    payload.errors = normalized.details;
  }

  if (process.env.NODE_ENV !== "production") {
    payload.stack = err?.stack;
  }

  res.status(status).json(payload);
};
