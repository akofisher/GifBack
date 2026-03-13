import { z } from "zod";

const clean = (value) =>
  typeof value === "string" ? value.trim() : value;

export const registerPushTokenSchema = z.object({
  token: z.preprocess(clean, z.string().min(20).max(4096)),
  deviceId: z.preprocess(clean, z.string().min(1).max(200)),
  platform: z
    .preprocess(
      (value) =>
        typeof value === "string" ? value.trim().toLowerCase() : value,
      z.enum(["android", "ios", "web", "unknown"]).default("unknown")
    )
    .optional(),
  appVersion: z.preprocess(clean, z.string().max(50)).optional(),
  locale: z.preprocess(clean, z.string().max(16)).optional(),
});
