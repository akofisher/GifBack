export const USER_BLOCK_TYPES = Object.freeze({
  NONE: "NONE",
  TEMPORARY_14_DAYS: "TEMPORARY_14_DAYS",
  PERMANENT: "PERMANENT",
});

export const USER_TEMPORARY_BLOCK_DAYS = 14;

export const USER_BLOCK_SUPPORT_URL =
  process.env.USER_BLOCK_SUPPORT_URL?.trim() || "https://t.me/GiftaApp";
