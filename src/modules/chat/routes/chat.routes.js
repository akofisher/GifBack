import { Router } from "express";
import { requireAuth } from "../../auth/middleware/auth.middleware.js";
import {
  createChatHandler,
  listChatsHandler,
  listMessagesHandler,
  markChatReadHandler,
  sendMessageHandler,
} from "../controllers/chat.controller.js";

const router = Router();

router.post("/requests/:id/chat", requireAuth, createChatHandler);
router.get("/chats", requireAuth, listChatsHandler);
router.get("/chats/:id/messages", requireAuth, listMessagesHandler);
router.post("/chats/:id/messages", requireAuth, sendMessageHandler);
router.patch("/chats/:id/read", requireAuth, markChatReadHandler);

export default router;
