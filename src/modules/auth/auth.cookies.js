export const REFRESH_COOKIE_NAME = "refreshToken";

export const getRefreshCookieOptions = () => {
  const isProd = process.env.NODE_ENV === "production";
  const days = Number(process.env.REFRESH_COOKIE_DAYS || 365);

  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/api/auth/refresh",
    maxAge: days * 24 * 60 * 60 * 1000,
  };
};

