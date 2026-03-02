import mongoose from "mongoose";
import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
} from "./marketplace.constants.js";

export const parsePagination = (options = {}) => {
  const hasPagination =
    options.page !== undefined || options.limit !== undefined;

  const page = Number.isInteger(options.page) && options.page > 0 ? options.page : 1;
  const limit = Number.isInteger(options.limit) && options.limit > 0
    ? Math.min(options.limit, MAX_PAGE_LIMIT)
    : DEFAULT_PAGE_LIMIT;

  return {
    hasPagination,
    page,
    limit,
    skip: hasPagination ? (page - 1) * limit : 0,
  };
};

export const buildPagination = ({ page, limit, total, hasPagination }) => {
  if (!hasPagination) {
    const effectiveLimit = total || 0;
    return {
      page: 1,
      limit: effectiveLimit,
      total,
      totalPages: 1,
      hasNext: false,
    };
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
  };
};

export const buildEmptyPaginatedResult = (options = {}, key = "items") => {
  const pagination = parsePagination(options);
  return {
    [key]: [],
    pagination: buildPagination({
      page: pagination.page,
      limit: pagination.limit,
      total: 0,
      hasPagination: pagination.hasPagination,
    }),
  };
};

export const parseObjectIdListFilter = (rawValue) => {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return { hasInput: false, ids: [], hasInvalid: false };
  }

  const chunks = Array.isArray(rawValue)
    ? rawValue.flatMap((entry) => String(entry).split(","))
    : String(rawValue).split(",");

  const normalized = chunks
    .map((entry) => entry.trim())
    .filter(Boolean);

  const ids = [];
  let hasInvalid = false;

  for (const id of normalized) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      hasInvalid = true;
      continue;
    }
    ids.push(id);
  }

  return {
    hasInput: normalized.length > 0,
    ids,
    hasInvalid,
  };
};

export const buildItemSort = (sort) => {
  if (sort === "createdAt_asc") return { createdAt: 1, _id: 1 };
  if (sort === "updatedAt_desc") return { updatedAt: -1, _id: -1 };
  if (sort === "updatedAt_asc") return { updatedAt: 1, _id: 1 };
  return { createdAt: -1, _id: -1 };
};

export const buildRequestSort = (sort) => {
  if (sort === "createdAt_asc") return { createdAt: 1, _id: 1 };
  if (sort === "updatedAt_desc") return { updatedAt: -1, _id: -1 };
  if (sort === "updatedAt_asc") return { updatedAt: 1, _id: 1 };
  return { createdAt: -1, _id: -1 };
};

export const buildHistorySort = (sort) => {
  if (sort === "completedAt_asc") return { completedAt: 1, _id: 1 };
  if (sort === "createdAt_desc") return { createdAt: -1, _id: -1 };
  if (sort === "createdAt_asc") return { createdAt: 1, _id: 1 };
  return { completedAt: -1, _id: -1 };
};
