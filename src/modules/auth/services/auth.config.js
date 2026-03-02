const parseEnvBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const parsePositiveNumber = (value, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return numeric;
};

export const ACCESS_TTL = process.env.ACCESS_TOKEN_TTL || "15m";
export const REFRESH_TTL = process.env.REFRESH_TOKEN_TTL || "365d";

export const EMAIL_VERIFICATION_REQUIRED = parseEnvBoolean(
  process.env.EMAIL_VERIFICATION_REQUIRED,
  true
);
export const EMAIL_VERIFY_CODE_TTL_MINUTES = parsePositiveNumber(
  process.env.EMAIL_VERIFY_CODE_TTL_MINUTES,
  10
);
export const EMAIL_VERIFY_RESEND_COOLDOWN_SECONDS = parsePositiveNumber(
  process.env.EMAIL_VERIFY_RESEND_COOLDOWN_SECONDS,
  60
);
export const EMAIL_VERIFY_MAX_ATTEMPTS = parsePositiveNumber(
  process.env.EMAIL_VERIFY_MAX_ATTEMPTS,
  5
);
export const EMAIL_VERIFICATION_SECRET =
  process.env.EMAIL_VERIFICATION_SECRET ||
  process.env.JWT_SECRET ||
  "email-secret";
export const PENDING_REGISTRATION_TTL_HOURS = parsePositiveNumber(
  process.env.PENDING_REGISTRATION_TTL_HOURS,
  24
);

export const PASSWORD_RESET_CODE_TTL_MINUTES = parsePositiveNumber(
  process.env.PASSWORD_RESET_CODE_TTL_MINUTES,
  10
);
export const PASSWORD_RESET_RESEND_COOLDOWN_SECONDS = parsePositiveNumber(
  process.env.PASSWORD_RESET_RESEND_COOLDOWN_SECONDS,
  60
);
export const PASSWORD_RESET_MAX_ATTEMPTS = parsePositiveNumber(
  process.env.PASSWORD_RESET_MAX_ATTEMPTS,
  5
);
export const PASSWORD_RESET_TOKEN_TTL_MINUTES = parsePositiveNumber(
  process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES,
  15
);
export const PASSWORD_RESET_SECRET =
  process.env.PASSWORD_RESET_SECRET ||
  process.env.JWT_SECRET ||
  "password-reset-secret";
