import { z } from "zod";

const imageSchema = z.object({
  url: z.string().trim().url(),
  link: z.union([z.string().trim().url(), z.literal("")]).optional(),
  publicId: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

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
const translationsSchema = z
  .record(z.string().trim().min(1), z.string().trim().min(1).max(10000))
  .optional();

export const adminCreateBlogSchema = z.object({
  title: z.string().trim().min(1).max(200),
  titleTranslations: z
    .record(z.string().trim().min(1), z.string().trim().min(1).max(260))
    .optional(),
  slug: z.string().trim().min(1).max(200).optional(),
  summary: z.string().trim().max(500).optional(),
  summaryTranslations: z
    .record(z.string().trim().min(1), z.string().trim().min(1).max(800))
    .optional(),
  content: z.string().trim().min(1),
  contentTranslations: translationsSchema,
  link: z.union([z.string().trim().url(), z.literal("")]).optional(),
  images: z.array(imageSchema).optional(),
  coverImage: imageSchema.optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  isPublished: z.boolean().optional(),
}).superRefine((payload, ctx) => {
  const hasLink = Boolean(payload.link?.trim());
  const hasImages = Array.isArray(payload.images) && payload.images.length > 0;
  const hasCoverImage = Boolean(payload.coverImage?.url);

  if (!hasLink && !hasImages && !hasCoverImage) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["link"],
      message: "Provide either link or at least one image",
    });
  }
});

export const adminUpdateBlogSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    titleTranslations: z
      .record(z.string().trim().min(1), z.string().trim().min(1).max(260))
      .optional(),
    slug: z.string().trim().min(1).max(200).optional(),
    summary: z.string().trim().max(500).optional(),
    summaryTranslations: z
      .record(z.string().trim().min(1), z.string().trim().min(1).max(800))
      .optional(),
    content: z.string().trim().min(1).optional(),
    contentTranslations: translationsSchema,
    link: z.union([z.string().trim().url(), z.literal("")]).optional(),
    images: z.array(imageSchema).optional(),
    coverImage: imageSchema.nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    isPublished: z.boolean().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required",
  });

export const adminListBlogsQuerySchema = z.object({
  isPublished: parseBooleanQuery,
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().trim().max(50).optional(),
});

export const publicListBlogsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().trim().max(50).optional(),
});
