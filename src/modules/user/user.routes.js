import { Router } from "express";
import { protect, requireAuth } from "../auth/auth.middleware.js";
import { deleteMeHandler, getAvatarUploadSignature, me, updateMeHandler, updateMyAvatar } from "./user.controller.js";

const router = Router();




router.patch("/me/avatar", protect, updateMyAvatar);
router.get("/me/avatar/signature", protect, getAvatarUploadSignature);
router.get("/me", requireAuth, me);
router.patch("/me", requireAuth, updateMeHandler);
router.delete("/me", requireAuth, deleteMeHandler);
router.get("/me", protect, me);         

export default router;
