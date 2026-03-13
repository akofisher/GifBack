import { Router } from "express";
import { requireAuth } from "../auth/middleware/auth.middleware.js";
import { uploadMediaHandler } from "./media.controller.js";
import { uploadMediaFilesMiddleware } from "./media.upload.js";

const router = Router();

router.post("/upload", requireAuth, uploadMediaFilesMiddleware, uploadMediaHandler);

export default router;
