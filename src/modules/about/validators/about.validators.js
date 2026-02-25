import { z } from "zod";

const imageSchema = z.object({
  url: z.string().min(1),
  publicId: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

const optionalString = z.string().trim().max(200).optional();
const socialLinkSchema = z.object({
  key: z.string().trim().min(1).max(60),
  label: z.string().trim().max(80).optional(),
  url: z.string().trim().url(),
});

const extraFieldSchema = z.object({
  key: z.string().trim().min(1).max(80),
  value: z.string().trim().max(500).optional(),
});

export const createAboutSchema = z.object({
  title: z.string().trim().min(1).max(200),
  subTitle: optionalString,
  description: z.string().trim().min(1).max(5000),
  socialLinks: z.array(socialLinkSchema).max(50).optional(),
  extraFields: z.array(extraFieldSchema).max(50).optional(),
  image: imageSchema.optional(),
});

export const updateAboutSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    subTitle: optionalString,
    description: z.string().trim().min(1).max(5000).optional(),
    socialLinks: z.array(socialLinkSchema).max(50).optional(),
    extraFields: z.array(extraFieldSchema).max(50).optional(),
    image: imageSchema.nullable().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required",
  });
