import { z } from "zod";

const versionSchema = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d+){1,3}$/, "Version must be numeric dot format, e.g. 1.0.1");

export const upsertAgreementSchema = z.object({
  version: versionSchema,
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(20000),
  isActive: z.boolean().optional(),
});
