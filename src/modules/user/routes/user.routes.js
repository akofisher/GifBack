import { Router } from "express";
import { protect, requireAuth } from "../../auth/middleware/auth.middleware.js";
import {
  changeMyPasswordHandler,
  deleteMeHandler,
  getTopGivenLeaderboardHandler,
  me,
  updateMeHandler,
  updateMyAvatar,
} from "../controllers/user.controller.js";
import {
  registerPushTokenHandler,
  removePushTokenByDeviceHandler,
} from "../../push/controllers/push.controller.js";

const router = Router();




router.get("/leaderboard/given", getTopGivenLeaderboardHandler);
router.patch("/me/avatar", protect, updateMyAvatar);
router.get("/me", requireAuth, me);
router.patch("/me", requireAuth, updateMeHandler);
router.patch("/me/password", requireAuth, changeMyPasswordHandler);
router.post("/me/push-tokens", requireAuth, registerPushTokenHandler);
router.delete(
  "/me/push-tokens/:deviceId",
  requireAuth,
  removePushTokenByDeviceHandler
);
router.delete("/me", requireAuth, deleteMeHandler);

export default router;
