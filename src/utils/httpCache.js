import crypto from "crypto";

const normalizeEtagHeader = (value) => {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

export const buildWeakEtag = (seed) => {
  const payload =
    typeof seed === "string" ? seed : JSON.stringify(seed ?? null);
  const hash = crypto.createHash("sha1").update(payload).digest("hex");
  return `W/"${hash}"`;
};

export const setCacheValidators = (res, { etag, lastModified } = {}) => {
  if (etag) {
    res.set("ETag", etag);
  }
  if (lastModified) {
    const date =
      lastModified instanceof Date
        ? lastModified
        : new Date(lastModified);
    if (!Number.isNaN(date.getTime())) {
      res.set("Last-Modified", date.toUTCString());
    }
  }
};

export const isRequestFresh = (req, { etag, lastModified } = {}) => {
  const ifNoneMatch = req.headers["if-none-match"];
  const ifModifiedSince = req.headers["if-modified-since"];

  if (etag && ifNoneMatch) {
    const candidates = normalizeEtagHeader(ifNoneMatch);
    if (candidates.includes("*") || candidates.includes(etag)) {
      return true;
    }
  }

  if (lastModified && ifModifiedSince) {
    const serverDate =
      lastModified instanceof Date
        ? lastModified
        : new Date(lastModified);
    const clientDate = new Date(ifModifiedSince);
    if (
      !Number.isNaN(serverDate.getTime()) &&
      !Number.isNaN(clientDate.getTime()) &&
      serverDate.getTime() <= clientDate.getTime()
    ) {
      return true;
    }
  }

  return false;
};
