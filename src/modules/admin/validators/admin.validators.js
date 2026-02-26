import { z } from "zod";

const objectIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid id");
const translationsSchema = z
  .record(z.string().trim().min(1), z.string().trim().min(1).max(160))
  .optional();

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

export const adminListItemsQuerySchema = z.object({
  itemId: z.string().trim().optional(),
  status: z.enum(["ACTIVE", "RESERVED", "COMPLETED", "REMOVED"]).optional(),
  mode: z.enum(["GIFT", "EXCHANGE"]).optional(),
  ownerId: z.string().trim().optional(),
  categoryId: z.string().trim().optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().trim().max(50).optional(),
});

export const adminUpdateItemSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(5000).optional(),
    categoryId: objectIdSchema.optional(),
    countryId: objectIdSchema.optional(),
    cityId: objectIdSchema.optional(),
    address: z.string().trim().max(300).optional(),
    images: z
      .array(
        z.object({
          url: z.string().min(1),
          publicId: z.string().optional(),
          width: z.number().optional(),
          height: z.number().optional(),
        })
      )
      .min(1)
      .optional(),
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
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required",
  });

export const adminCreateCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  nameTranslations: translationsSchema,
  order: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const adminCreateLocationCountrySchema = z.object({
  name: z.string().trim().min(1).max(120),
  nameTranslations: translationsSchema,
  localName: z.string().trim().max(120).optional(),
  code: z.string().trim().min(2).max(10),
  order: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const adminUpdateLocationCountrySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    nameTranslations: translationsSchema,
    localName: z.string().trim().max(120).optional(),
    code: z.string().trim().min(2).max(10).optional(),
    order: z.coerce.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required",
  });

export const adminCreateLocationCitySchema = z.object({
  name: z.string().trim().min(1).max(120),
  nameTranslations: translationsSchema,
  localName: z.string().trim().max(120).optional(),
  order: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const adminUpdateLocationCitySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    nameTranslations: translationsSchema,
    localName: z.string().trim().max(120).optional(),
    order: z.coerce.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required",
  });

export const adminUpdateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    nameTranslations: translationsSchema,
    order: z.coerce.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required",
  });

export const adminListUsersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  role: z.enum(["user", "admin", "super_admin"]).optional(),
  isActive: parseBooleanQuery,
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.string().trim().max(50).optional(),
});

export const adminUserToggleSchema = z.object({
  isActive: z.boolean(),
});

export const adminListStaffQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  role: z.enum(["admin", "super_admin"]).optional(),
  isActive: parseBooleanQuery,
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.string().trim().max(50).optional(),
});

export const adminRegisterStaffSchema = z.object({
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  email: z.string().trim().email(),
  phone: z.string().trim().min(6).max(30).optional(),
  preferredLanguage: z.enum(["en", "ka"]).optional(),
  password: z
    .string()
    .min(8)
    .max(100)
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one digit"),
});
