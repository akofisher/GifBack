import {
  createChatForRequest,
  listChats,
  listMessages,
  sendMessage,
} from "../services/chat.service.js";
import {
  listChatsQuerySchema,
  listMessagesQuerySchema,
} from "../validators/chat.validators.js";

export const createChatHandler = async (req, res, next) => {
  try {
    const chat = await createChatForRequest(req.user.id, req.params.id);
    res.status(201).json({ success: true, chat });
  } catch (err) {
    next(err);
  }
};

export const listChatsHandler = async (req, res, next) => {
  try {
    const query = listChatsQuerySchema.parse(req.query || {});
    const result = await listChats(req.user.id, query);
    res.status(200).json({
      success: true,
      data: result.chats,
      pagination: result.pagination,
      chats: result.chats,
    });
  } catch (err) {
    next(err);
  }
};

export const listMessagesHandler = async (req, res, next) => {
  try {
    const query = listMessagesQuerySchema.parse(req.query || {});
    const result = await listMessages(req.user.id, req.params.id, query);
    res.status(200).json({
      success: true,
      data: result.messages,
      pagination: result.pagination,
      messages: result.messages,
    });
  } catch (err) {
    next(err);
  }
};

export const sendMessageHandler = async (req, res, next) => {
  try {
    const { text } = req.body || {};
    const message = await sendMessage(req.user.id, req.params.id, text);
    res.status(201).json({ success: true, message });
  } catch (err) {
    next(err);
  }
};
