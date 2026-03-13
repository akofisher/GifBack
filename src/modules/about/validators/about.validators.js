import { z } from "zod";

const imageSchema = z.object({
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

const optionalString = z.string().trim().max(200).optional();
const translationsSchema = z
  .record(z.string().trim().min(1), z.string().trim().min(1).max(5000))
  .optional();
const socialLinkSchema = z.object({
  key: z.string().trim().min(1).max(60),
  label: z.string().trim().max(80).optional(),
  labelTranslations: z
    .record(z.string().trim().min(1), z.string().trim().min(1).max(120))
    .optional(),
  url: z.string().trim().url(),
});

const extraFieldSchema = z.object({
  key: z.string().trim().min(1).max(80),
  keyTranslations: z
    .record(z.string().trim().min(1), z.string().trim().min(1).max(120))
    .optional(),
  value: z.string().trim().max(500).optional(),
  valueTranslations: z
    .record(z.string().trim().min(1), z.string().trim().min(1).max(600))
    .optional(),
});

export const createAboutSchema = z.object({
  title: z.string().trim().min(1).max(200),
  titleTranslations: z
    .record(z.string().trim().min(1), z.string().trim().min(1).max(260))
    .optional(),
  subTitle: optionalString,
  subTitleTranslations: z
    .record(z.string().trim().min(1), z.string().trim().min(1).max(260))
    .optional(),
  description: z.string().trim().min(1).max(5000),
  descriptionTranslations: translationsSchema,
  socialLinks: z.array(socialLinkSchema).max(50).optional(),
  extraFields: z.array(extraFieldSchema).max(50).optional(),
  image: imageSchema.optional(),
});

export const updateAboutSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    titleTranslations: z
      .record(z.string().trim().min(1), z.string().trim().min(1).max(260))
      .optional(),
    subTitle: optionalString,
    subTitleTranslations: z
      .record(z.string().trim().min(1), z.string().trim().min(1).max(260))
      .optional(),
    description: z.string().trim().min(1).max(5000).optional(),
    descriptionTranslations: translationsSchema,
    socialLinks: z.array(socialLinkSchema).max(50).optional(),
    extraFields: z.array(extraFieldSchema).max(50).optional(),
    image: imageSchema.nullable().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required",
  });
