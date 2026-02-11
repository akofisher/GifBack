import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import { errorHandler } from "./middlewares/error.middleware.js";
import { notFound } from "./utils/appError.js";
import authRoutes from "./modules/auth/auth.routes.js";
import userRoutes from "./modules/user/user.routes.js";



const app = express();
app.set("trust proxy", 1);

app.use(helmet());

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:5000",
    ],
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
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

app.use((req, res, next) => {
  next(notFound("Route not found", "ROUTE_NOT_FOUND"));
});

/**
 * ❌ ERROR HANDLER (LAST)
 */
app.use(errorHandler);

export default app;
