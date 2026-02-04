
export const errorHandler = (err, req, res, next) => {
  const status = err.status || 500;

  // Zod validation error
  if (err?.name === "ZodError") {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      errors: err.errors?.map(e => ({ path: e.path.join("."), message: e.message })),
    });
  }

  res.status(status).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
};

