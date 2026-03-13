import path from "node:path";

const DEFAULT_CDN_ROOT = "/var/www/cdn.gifta.ge";
const DEFAULT_CDN_BASE_URL = "https://cdn.gifta.ge";
const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const DEFAULT_ALLOWED_FOLDERS = ["items", "avatars", "blogs", "temp", "about", "categories"];

const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const parseAllowedFolders = (value) => {
  if (!value || typeof value !== "string") {
    return new Set(DEFAULT_ALLOWED_FOLDERS);
  }

  const folders = value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .map((entry) => entry.replace(/[^a-z0-9_-]/g, ""));

  if (!folders.length) {
    return new Set(DEFAULT_ALLOWED_FOLDERS);
  }

  return new Set(folders);
};

const normalizeBaseUrl = (value) => {
  const input = String(value || DEFAULT_CDN_BASE_URL).trim();
  return input.replace(/\/+$/, "");
};

export const CDN_ROOT = path.resolve(process.env.CDN_ROOT || DEFAULT_CDN_ROOT);
export const CDN_BASE_URL = normalizeBaseUrl(process.env.CDN_BASE_URL);
export const MEDIA_MAX_UPLOAD_BYTES = parsePositiveInt(
  process.env.MEDIA_MAX_UPLOAD_BYTES,
  DEFAULT_MAX_UPLOAD_BYTES
);
export const MEDIA_ALLOWED_FOLDERS = parseAllowedFolders(
  process.env.MEDIA_ALLOWED_FOLDERS
);

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
