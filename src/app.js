import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import { errorHandler } from "./middlewares/error.middleware.js";
import { localeMiddleware } from "./middlewares/locale.middleware.js";
import { notFound } from "./utils/appError.js";
import authRoutes from "./modules/auth/routes/auth.routes.js";
import userRoutes from "./modules/user/routes/user.routes.js";
import marketplaceRoutes from "./modules/marketplace/routes/marketplace.routes.js";
import chatRoutes from "./modules/chat/routes/chat.routes.js";
import reportRoutes from "./modules/reports/routes/report.routes.js";
import adminRoutes from "./modules/admin/routes/admin.routes.js";
import blogRoutes from "./modules/blog/routes/blog.routes.js";
import aboutRoutes from "./modules/about/routes/about.routes.js";
import appVersionRoutes from "./modules/app-update/routes/app-version.routes.js";
import agreementRoutes from "./modules/agreement/routes/agreement.routes.js";
import donationRoutes from "./modules/donation/routes/donation.routes.js";
import observabilityRoutes from "./modules/observability/routes/observability.routes.js";
import mediaRoutes from "./modules/media/media.routes.js";
import { requestContextMiddleware } from "./middlewares/request-context.middleware.js";
import { responseCaptureMiddleware } from "./middlewares/response-capture.middleware.js";
import { requestMetricsMiddleware } from "./middlewares/request-metrics.middleware.js";
import { adminAuditMiddleware } from "./middlewares/admin-audit.middleware.js";

const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const app = express();
app.set("trust proxy", 1);

app.use(helmet());
app.use(requestContextMiddleware);

const corsOptions = {
  origin: [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5000",
  ],
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
};

app.use(
  cors(corsOptions)
);

app.use(express.json());
app.use(cookieParser());
app.use(localeMiddleware);
app.use(responseCaptureMiddleware);
app.use(requestMetricsMiddleware);
app.use(adminAuditMiddleware);

app.use(
  rateLimit({
    windowMs: parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    max: parsePositiveInt(process.env.RATE_LIMIT_MAX, 2000),
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === "/api/auth/refresh",
    handler: (req, res) => {
      const payload = {
        success: false,
        message: "Too many requests, please try again later.",
        code: "RATE_LIMIT_EXCEEDED",
      };
      if (req.requestId) payload.requestId = req.requestId;
      res.status(429).json(payload);
    },
  })
);

/**
 * 🧪 HEALTH CHECK
 */
app.get("/", (req, res) => {
  res.status(200).json({ ok: true, message: "API is running" });
});

/**
 * 📦 ROUTES
 */

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api", marketplaceRoutes);
app.use("/api", chatRoutes);
app.use("/api", reportRoutes);
app.use("/api", adminRoutes);
app.use("/api", blogRoutes);
app.use("/api", aboutRoutes);
app.use("/api", appVersionRoutes);
app.use("/api", agreementRoutes);
app.use("/api", donationRoutes);
app.use("/api", observabilityRoutes);
app.use("/api/media", mediaRoutes);

app.use((req, res, next) => {
  next(notFound("Route not found", "ROUTE_NOT_FOUND"));
});

/**
 * ❌ ERROR HANDLER (LAST)
 */
app.use(errorHandler);

export default app;
