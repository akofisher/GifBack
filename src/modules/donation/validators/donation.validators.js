import { z } from "zod";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Invalid id");

const optionalUrlSchema = z
  .union([z.literal(""), z.string().trim().url("link must be a valid URL")])
  .optional();

const donationMethodSchema = z.object({
  id: objectIdSchema.optional(),
  label: z.string().trim().min(1).max(120),
  accountNumber: z.string().trim().min(1).max(120),
  link: optionalUrlSchema,
  isActive: z.boolean().optional(),
  order: z.coerce.number().int().min(0).optional(),
});

export const upsertDonationConfigSchema = z.object({
  methods: z.array(donationMethodSchema).max(50),
});
