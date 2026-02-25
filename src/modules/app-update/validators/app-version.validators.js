import { z } from "zod";

const versionSchema = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d+){1,3}$/, "Version must be numeric dot format, e.g. 1.0.1");

const optionalUrlSchema = z
  .union([z.literal(""), z.string().trim().url("storeUrl must be a valid URL")])
  .optional();

const adminPlatformPatchSchema = z
  .object({
    latestVersion: versionSchema.optional(),
    minSupportedVersion: versionSchema.optional(),
    storeUrl: optionalUrlSchema,
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required",
  });

export const appVersionAdminPatchSchema = z
  .object({
    android: adminPlatformPatchSchema.optional(),
    ios: adminPlatformPatchSchema.optional(),
    updateMessage: z.string().trim().min(1).max(300).optional(),
    isEnabled: z.boolean().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required",
  });

export const appVersionQuerySchema = z
  .object({
    platform: z.enum(["android", "ios"]).optional(),
    currentVersion: versionSchema.optional(),
  })
  .superRefine((query, ctx) => {
    if (query.currentVersion && !query.platform) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["platform"],
        message: "platform is required when currentVersion is provided",
      });
    }
  });
