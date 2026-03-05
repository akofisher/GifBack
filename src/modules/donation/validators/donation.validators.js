import { z } from "zod";
import { AppError } from "../../../utils/appError.js";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Invalid id");

export const DONATION_METHOD_CONTACT_REQUIRED = "DONATION_METHOD_CONTACT_REQUIRED";
export const DONATION_METHOD_CONTACT_CONFLICT = "DONATION_METHOD_CONTACT_CONFLICT";

const optionalAccountSchema = z.string().trim().max(120).optional();

const optionalUrlSchema = z
  .string()
  .trim()
  .max(500)
  .url("link must be a valid URL")
  .refine((value) => /^https?:\/\//i.test(value), {
    message: "link must start with http:// or https://",
  })
  .optional();

const donationMethodSchema = z
  .object({
    id: objectIdSchema.optional(),
    label: z.string().trim().min(1).max(120),
    labelTranslations: z
      .record(z.string().trim().min(1), z.string().trim().min(1).max(160))
      .optional(),
    accountNumber: optionalAccountSchema,
    link: optionalUrlSchema,
    isActive: z.boolean().optional(),
    order: z.coerce.number().int().min(0).optional(),
  })
  .superRefine((method, ctx) => {
    const account = method.accountNumber?.trim() || "";
    const link = method.link?.trim() || "";
    const hasAccount = account.length > 0;
    const hasLink = link.length > 0;

    if (!hasAccount && !hasLink) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["accountNumber"],
        message: "Exactly one of accountNumber or link is required",
        params: { appCode: DONATION_METHOD_CONTACT_REQUIRED },
      });
      return;
    }

    if (hasAccount && hasLink) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["accountNumber"],
        message: "Provide either accountNumber or link, not both",
        params: { appCode: DONATION_METHOD_CONTACT_CONFLICT },
      });
    }
  });

export const upsertDonationConfigSchema = z.object({
  methods: z.array(donationMethodSchema).max(50),
});

const formatValidationDetails = (issues = []) =>
  issues.map((issue) => ({
    field: issue.path?.join(".") || "methods",
    message: issue.message,
  }));

export const parseUpsertDonationConfigPayload = (payload) => {
  const result = upsertDonationConfigSchema.safeParse(payload || {});
  if (result.success) {
    return result.data;
  }

  const codedIssue = result.error.issues.find(
    (issue) =>
      issue?.params?.appCode === DONATION_METHOD_CONTACT_REQUIRED ||
      issue?.params?.appCode === DONATION_METHOD_CONTACT_CONFLICT
  );

  if (codedIssue) {
    const code = codedIssue.params.appCode;
    const message =
      code === DONATION_METHOD_CONTACT_REQUIRED
        ? "Donation method must include either accountNumber or link"
        : "Donation method cannot include both accountNumber and link";
    throw new AppError(message, 422, code, formatValidationDetails(result.error.issues));
  }

  throw result.error;
};
