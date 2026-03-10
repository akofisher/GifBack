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
