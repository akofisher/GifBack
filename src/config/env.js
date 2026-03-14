import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  PORT: z.coerce.number().int().positive().default(5050),
  MONGO_URI: z.string().trim().min(1),
  JWT_SECRET: z.string().trim().min(1),
  JWT_REFRESH_SECRET: z.string().trim().min(1),
  REQUEST_EXPIRE_HOURS: z.coerce.number().int().positive(),
  MAX_ACTIVE_GIFT_ITEMS: z.coerce.number().int().positive(),
  MAX_ACTIVE_EXCHANGE_ITEMS: z.coerce.number().int().positive(),
  GIFT_LIMIT_PER_WEEK: z.coerce.number().int().positive(),
  CDN_ROOT: z.string().trim().min(1).optional(),
  CDN_BASE_URL: z.string().trim().min(1).optional(),
  MEDIA_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().optional(),
  MEDIA_ALLOWED_FOLDERS: z.string().trim().min(1).optional(),
  FCM_ENABLED: z.string().trim().min(1).optional(),
  FCM_PROJECT_ID: z.string().trim().min(1).optional(),
  FCM_CLIENT_EMAIL: z.string().trim().min(1).optional(),
  FCM_PRIVATE_KEY: z.string().trim().min(1).optional(),
  FCM_PRIVATE_KEY_BASE64: z.string().trim().min(1).optional(),
  MAX_ACTIVE_PUSH_TOKENS_PER_USER: z.coerce.number().int().positive().optional(),
});

let cachedEnv = null;

export const validateEnv = () => {
  if (cachedEnv) return cachedEnv;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${message}`);
  }

  cachedEnv = result.data;
  return cachedEnv;
};
