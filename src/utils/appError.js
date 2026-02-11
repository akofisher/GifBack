export class AppError extends Error {
  constructor(message, status = 500, code = "INTERNAL_ERROR", details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}

const build = (status, message, code, details) =>
  new AppError(message, status, code, details);

export const badRequest = (
  message = "Bad request",
  code = "BAD_REQUEST",
  details
) => build(400, message, code, details);

export const unauthorized = (
  message = "Unauthorized",
  code = "UNAUTHORIZED",
  details
) => build(401, message, code, details);

export const forbidden = (
  message = "Forbidden",
  code = "FORBIDDEN",
  details
) => build(403, message, code, details);

export const notFound = (
  message = "Not found",
  code = "NOT_FOUND",
  details
) => build(404, message, code, details);

export const conflict = (
  message = "Conflict",
  code = "CONFLICT",
  details
) => build(409, message, code, details);

export const tooManyRequests = (
  message = "Too many requests",
  code = "TOO_MANY_REQUESTS",
  details
) => build(429, message, code, details);
