import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  ALLOWED_IMAGE_MIME_TYPES,
  CDN_BASE_URL,
  CDN_ROOT,
  MEDIA_ALLOWED_FOLDERS,
} from "../../config/media.js";
import { badRequest } from "../../utils/appError.js";

const MIME_TO_EXTENSION = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const toPosixPath = (value) => value.split(path.sep).join("/");

const sanitizeFolder = (value = "temp") => {
  const normalized = String(value || "temp")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");

  const folder = normalized || "temp";
  if (!MEDIA_ALLOWED_FOLDERS.has(folder)) {
    throw badRequest("Validation error", "VALIDATION_ERROR", [
      { field: "folder", message: "Invalid upload folder" },
    ]);
  }

  return folder;
};

const resolveSafeAbsolutePath = (relativePath) => {
  const resolved = path.resolve(CDN_ROOT, relativePath);
  const rootWithSeparator = CDN_ROOT.endsWith(path.sep)
    ? CDN_ROOT
    : `${CDN_ROOT}${path.sep}`;

  if (resolved !== CDN_ROOT && !resolved.startsWith(rootWithSeparator)) {
    throw badRequest("Invalid media path", "INVALID_MEDIA_PATH");
  }

  return resolved;
};

const buildPublicUrl = (relativePath) => `${CDN_BASE_URL}/${toPosixPath(relativePath)}`;

const extensionFromFile = ({ mimetype = "", originalname = "" }) => {
  const mimeExtension = MIME_TO_EXTENSION[mimetype.toLowerCase()];
  if (mimeExtension) return mimeExtension;

  const ext = path.extname(originalname).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
    return ext === ".jpeg" ? ".jpg" : ext;
  }

  throw badRequest("Validation error", "INVALID_MEDIA_MIME_TYPE", [
    { field: "file", message: "Only jpg, jpeg, png, webp are supported" },
  ]);
};

export const ensureUploadFolder = async (folder) => {
  const normalizedFolder = sanitizeFolder(folder);
  const target = resolveSafeAbsolutePath(normalizedFolder);
  await fs.mkdir(target, { recursive: true });
  return { normalizedFolder, absoluteFolderPath: target };
};

export const saveUploadedImage = async ({ file, folder }) => {
  if (!file?.buffer?.length) {
    throw badRequest("Validation error", "MISSING_MEDIA_FILE", [
      { field: "file", message: "Image file is required" },
    ]);
  }

  const mimetype = String(file.mimetype || "").toLowerCase();
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimetype)) {
    throw badRequest("Validation error", "INVALID_MEDIA_MIME_TYPE", [
      { field: "file", message: "Only jpg, jpeg, png, webp are supported" },
    ]);
  }

  const { normalizedFolder, absoluteFolderPath } = await ensureUploadFolder(folder);
  const extension = extensionFromFile(file);
  const filename = `${Date.now()}-${crypto.randomUUID()}${extension}`;
  const relativePath = path.posix.join(normalizedFolder, filename);
  const absolutePath = path.join(absoluteFolderPath, filename);

  await fs.writeFile(absolutePath, file.buffer);

  return {
    url: buildPublicUrl(relativePath),
    path: absolutePath,
    filename,
    mimeType: mimetype,
    size: Number(file.size || file.buffer.length || 0),
    provider: "local",
  };
};

const extractRelativePathFromUrl = (url) => {
  if (typeof url !== "string" || !url.startsWith(CDN_BASE_URL)) return null;
  const relative = url.slice(CDN_BASE_URL.length).replace(/^\/+/, "");
  return relative || null;
};

const toAbsolutePath = (entry) => {
  if (!entry || typeof entry !== "object") return null;

  if (typeof entry.path === "string" && entry.path.trim()) {
    const candidate = entry.path.trim();
    if (path.isAbsolute(candidate)) {
      return resolveSafeAbsolutePath(path.relative(CDN_ROOT, candidate));
    }
    return resolveSafeAbsolutePath(candidate);
  }

  const relativeFromUrl = extractRelativePathFromUrl(entry.url);
  if (!relativeFromUrl) return null;
  return resolveSafeAbsolutePath(relativeFromUrl);
};

export const extractMediaRefs = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "object") return [value];
  return [];
};

const mediaRefKey = (entry) => {
  if (!entry || typeof entry !== "object") return "";
  return entry.path || entry.url || "";
};

export const diffMediaRefs = (previous = [], next = []) => {
  const prevRefs = extractMediaRefs(previous);
  const nextRefs = new Set(extractMediaRefs(next).map(mediaRefKey).filter(Boolean));
  return prevRefs.filter((entry) => {
    const key = mediaRefKey(entry);
    return key && !nextRefs.has(key);
  });
};

export const deleteMediaAssets = async (mediaRefs = []) => {
  const refs = extractMediaRefs(mediaRefs);
  if (!refs.length) {
    return { requested: 0, deleted: 0, failed: 0 };
  }

  let deleted = 0;
  let failed = 0;

  for (const entry of refs) {
    try {
      const absolutePath = toAbsolutePath(entry);
      if (!absolutePath) continue;
      await fs.unlink(absolutePath);
      deleted += 1;
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      failed += 1;
    }
  }

  return {
    requested: refs.length,
    deleted,
    failed,
  };
};
