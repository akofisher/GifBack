import { Router } from "express";
import { login, logout, logoutAll, refresh, register, revokeSessionById, sessions } from "./auth.controller.js";
import { requireAuth } from "./auth.middleware.js";

const router = Router();



router.post("/logout-all", requireAuth, logoutAll);
router.post("/sessions/:sessionId/revoke", requireAuth, revokeSessionById);
router.get("/sessions", requireAuth, sessions);
router.post("/login", login);
router.post("/register", register);
router.post("/refresh", refresh);
router.post("/logout", logout);

export default router;



