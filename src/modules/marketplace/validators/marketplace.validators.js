import { z } from "zod";

const paginationQuerySchema = {
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
};

const upperEnum = (values) =>
  z.preprocess((value) => {
    if (typeof value === "string") return value.trim().toUpperCase();
    return value;
  }, z.enum(values));

const parseBooleanQuery = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return value;
}, z.boolean().optional());

const imageInputSchema = z.object({
  url: z.string().min(1),
  path: z.string().optional(),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
  size: z.number().nonnegative().optional(),
  provider: z.string().optional(),
  publicId: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

export const createItemSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  categoryId: z.string().min(1),
  countryId: z.string().min(1),
  cityId: z.string().min(1),
  address: z.string().trim().max(300).optional(),
  mode: z.enum(["GIFT", "EXCHANGE"]),
  images: z.array(imageInputSchema).min(1),
});

export const updateItemSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    categoryId: z.string().min(1).optional(),
    countryId: z.string().min(1).optional(),
    cityId: z.string().min(1).optional(),
    address: z.string().trim().max(300).optional(),
    mode: z.enum(["GIFT", "EXCHANGE"]).optional(),
    images: z.array(imageInputSchema).min(1).optional(),
  })
  .superRefine((payload, ctx) => {
    const hasCountry = payload.countryId !== undefined;
    const hasCity = payload.cityId !== undefined;
    if (hasCountry !== hasCity) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: hasCountry ? ["cityId"] : ["countryId"],
        message: "countryId and cityId must be provided together",
      });
    }
  });

export const createRequestSchema = z.object({
  type: z.enum(["GIFT", "EXCHANGE"]),
  offeredItemId: z.string().optional(),
  message: z.string().trim().max(1000).optional(),
});

export const respondSchema = z.object({
  action: z.enum(["approve", "reject"]),
});

export const listItemsQuerySchema = z.object({
  ...paginationQuerySchema,
  mode: upperEnum(["GIFT", "EXCHANGE"]).optional(),
  search: z.string().trim().max(120).optional(),
  categoryIds: z.string().trim().max(2000).optional(),
  cityIds: z.string().trim().max(2000).optional(),
  sort: z
    .enum(["createdAt_desc", "createdAt_asc", "updatedAt_desc", "updatedAt_asc"])
    .optional(),
});

export const listMyItemsQuerySchema = z.object({
  ...paginationQuerySchema,
  mode: upperEnum(["GIFT", "EXCHANGE"]).optional(),
  status: upperEnum(["ACTIVE", "RESERVED", "COMPLETED", "REMOVED"]).optional(),
  sort: z
    .enum(["createdAt_desc", "createdAt_asc", "updatedAt_desc", "updatedAt_asc"])
    .optional(),
});

export const listRequestsQuerySchema = z.object({
  ...paginationQuerySchema,
  status: upperEnum([
    "PENDING",
    "APPROVED",
    "REJECTED",
    "CANCELED",
    "EXPIRED",
    "COMPLETED",
  ]).optional(),
  type: upperEnum(["GIFT", "EXCHANGE"]).optional(),
  includeAutoCanceled: parseBooleanQuery,
  sort: z
    .enum(["createdAt_desc", "createdAt_asc", "updatedAt_desc", "updatedAt_asc"])
    .optional(),
});

export const historyQuerySchema = z.object({
  ...paginationQuerySchema,
  role: z.string().trim().max(40).optional(),
  sort: z
    .enum(["completedAt_desc", "completedAt_asc", "createdAt_desc", "createdAt_asc"])
    .optional(),
});
