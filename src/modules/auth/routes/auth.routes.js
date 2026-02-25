import { Router } from "express";
import {
  confirmPasswordResetHandler,
  login,
  logout,
  logoutAll,
  requestPasswordResetHandler,
  refresh,
  register,
  requestEmailVerificationHandler,
  revokeSessionById,
  sessions,
  verifyPasswordResetHandler,
  verifyEmailHandler,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();



router.post("/logout-all", requireAuth, logoutAll);
router.post("/sessions/:sessionId/revoke", requireAuth, revokeSessionById);
router.get("/sessions", requireAuth, sessions);
router.post("/login", login);
router.post("/register", register);
router.post("/email/verify/request", requestEmailVerificationHandler);
router.post("/email/verify/confirm", verifyEmailHandler);
router.post("/password/forgot/request", requestPasswordResetHandler);
router.post("/password/forgot/verify", verifyPasswordResetHandler);
router.post("/password/forgot/reset", confirmPasswordResetHandler);
router.post("/refresh", refresh);
router.post("/logout", logout);

export default router;
