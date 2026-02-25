import { z } from "zod";
import {
  REPORT_CATEGORIES,
  REPORT_STATUSES,
  REPORT_STATUS_UPDATES,
} from "../reports.constants.js";

export const createProductReportSchema = z
  .object({
    itemId: z.string().trim().min(1),
    category: z.enum(REPORT_CATEGORIES),
    description: z.string().trim().max(300).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.category === "OTHER" && !data.description?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["description"],
        message: "Description is required when category is OTHER",
      });
    }
  });

export const listAdminReportsSchema = z.object({
  itemId: z.string().trim().optional(),
  status: z.enum(REPORT_STATUSES).optional(),
  category: z.enum(REPORT_CATEGORIES).optional(),
  reporterId: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().trim().max(50).optional(),
});

export const updateReportStatusSchema = z.object({
  status: z.enum(REPORT_STATUS_UPDATES),
});
