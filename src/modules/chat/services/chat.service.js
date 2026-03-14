import mongoose from "mongoose";
import Chat from "../models/chat.model.js";
import Message from "../models/message.model.js";
import ItemRequest from "../../marketplace/models/request.model.js";
import { conflict, forbidden, notFound, badRequest } from "../../../utils/appError.js";

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

const parsePagination = (options = {}) => {
  const hasPagination =
    options.page !== undefined || options.limit !== undefined;

  const page = Number.isInteger(options.page) && options.page > 0 ? options.page : 1;
  const limit = Number.isInteger(options.limit) && options.limit > 0
    ? Math.min(options.limit, MAX_PAGE_LIMIT)
    : DEFAULT_PAGE_LIMIT;

  return {
    hasPagination,
    page,
    limit,
    skip: hasPagination ? (page - 1) * limit : 0,
  };
};

const buildPagination = ({ page, limit, total, hasPagination }) => {
  if (!hasPagination) {
    return {
      page: 1,
      limit: total || 0,
      total,
      totalPages: 1,
      hasNext: false,
    };
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
  };
};

const buildName = (firstName, lastName) =>
  [firstName, lastName].filter(Boolean).join(" ").trim();

const toIdString = (value) =>
  value?.toString?.() || (value ? String(value) : "");

const toUserReadStateMap = (chat) => {
  const map = new Map();
  const entries = Array.isArray(chat?.readState) ? chat.readState : [];

  for (const entry of entries) {
    const key = toIdString(entry?.userId);
    if (!key) continue;
    map.set(key, {
      unreadCount: Math.max(0, Number(entry?.unreadCount || 0)),
      lastReadAt: entry?.lastReadAt || null,
    });
  }

  return map;
};

const getViewerUnreadCount = (chat, viewerId) => {
  if (!viewerId) return null;
  const key = toIdString(viewerId);
  if (!key) return null;
  const state = toUserReadStateMap(chat).get(key);
  return Math.max(0, Number(state?.unreadCount || 0));
};

const formatChat = (chat, viewerId = null) => {
  const participantDetails = Array.isArray(chat.participants)
    ? chat.participants.map((entry) => {
        if (entry && typeof entry === "object" && entry._id) {
          const avatarUrl = entry.avatar?.url || "";
          return {
            id: entry._id.toString(),
            firstName: entry.firstName || "",
            lastName: entry.lastName || "",
            name: buildName(entry.firstName, entry.lastName),
            avatarUrl,
          };
        }

        const id = entry?.toString?.() || String(entry || "");
        return {
          id,
          firstName: "",
          lastName: "",
          name: "",
          avatarUrl: "",
        };
      })
    : [];

  const participantIds = participantDetails.map((entry) => entry.id);
  const viewerUnreadCount = getViewerUnreadCount(chat, viewerId);

  return {
    ...chat,
    id: chat._id?.toString?.() || chat._id,
    requestId: chat.requestId?.toString?.() || chat.requestId,
    participants: participantIds,
    participantDetails,
    unreadCount: viewerUnreadCount,
    viewerUnreadCount,
    hasUnread: viewerUnreadCount === null ? null : viewerUnreadCount > 0,
    viewerHasUnread:
      viewerUnreadCount === null ? null : viewerUnreadCount > 0,
  };
};

const formatMessage = (message) => ({
  ...message,
  id: message._id?.toString?.() || message._id,
  chatId: message.chatId?.toString?.() || message.chatId,
  senderId: message.senderId?.toString?.() || message.senderId,
});

export const getChatUnreadSummary = async (userId) => {
  const rows = await Chat.find({
    participants: userId,
    status: "OPEN",
  })
    .select("_id readState")
    .lean();

  const unreadByChatId = {};
  let unread = 0;

  for (const row of rows) {
    const chatId = row?._id?.toString?.();
    if (!chatId) continue;

    const chatUnread = getViewerUnreadCount(row, userId) || 0;
    if (chatUnread > 0) {
      unreadByChatId[chatId] = chatUnread;
    }
    unread += chatUnread;
  }

  return {
    unread,
    total: rows.length,
    unreadByChatId,
  };
};

export const createChatForRequest = async (userId, requestId) => {
  const session = await mongoose.startSession();
  let chat;

  await session.withTransaction(async () => {
    const request = await ItemRequest.findById(requestId).session(session);
    if (!request) throw notFound("Request not found", "REQUEST_NOT_FOUND");

    const isOwner = request.ownerId.toString() === userId.toString();
    const isRequester = request.requesterId.toString() === userId.toString();
    if (!isOwner && !isRequester) {
      throw forbidden("Not allowed", "REQUEST_NOT_PARTICIPANT");
    }

    if (request.status !== "APPROVED") {
      throw conflict("Request is not approved", "REQUEST_NOT_APPROVED");
    }

    if (request.chatId) {
      chat = await Chat.findById(request.chatId).session(session);
      if (chat) return;
    }

    chat = await Chat.create(
      [
        {
          requestId: request._id,
          participants: [request.ownerId, request.requesterId],
          status: "OPEN",
          readState: [
            {
              userId: request.ownerId,
              unreadCount: 0,
              lastReadAt: new Date(),
            },
            {
              userId: request.requesterId,
              unreadCount: 0,
              lastReadAt: new Date(),
            },
          ],
        },
      ],
      { session }
    ).then((rows) => rows[0]);

    request.chatId = chat._id;
    await request.save({ session });
  });

  session.endSession();
  return chat;
};

export const listChats = async (userId, options = {}) => {
  const filter = { participants: userId, status: "OPEN" };
  const pagination = parsePagination(options);

  let query = Chat.find(filter)
    .sort({ lastMessageAt: -1, updatedAt: -1, _id: -1 })
    .populate({ path: "participants", select: "firstName lastName avatar" });

  if (pagination.hasPagination) {
    query = query.skip(pagination.skip).limit(pagination.limit);
  }

  const [rows, total] = await Promise.all([
    query.lean(),
    Chat.countDocuments(filter),
  ]);

  return {
    chats: rows.map((chat) => formatChat(chat, userId)),
    pagination: buildPagination({
      page: pagination.page,
      limit: pagination.limit,
      total,
      hasPagination: pagination.hasPagination,
    }),
  };
};

export const listMessages = async (userId, chatId, options = {}) => {
  const chat = await Chat.findById(chatId).lean();
  if (!chat) throw notFound("Chat not found", "CHAT_NOT_FOUND");

  const isParticipant = chat.participants.some(
    (id) => id.toString() === userId.toString()
  );
  if (!isParticipant) throw forbidden("Not allowed", "CHAT_ACCESS_FORBIDDEN");

  const pagination = parsePagination(options);
  const filter = { chatId };

  if (options.before) {
    let beforeDate = null;

    if (mongoose.Types.ObjectId.isValid(options.before)) {
      const anchor = await Message.findOne({
        _id: options.before,
        chatId,
      })
        .select("createdAt")
        .lean();
      if (anchor?.createdAt) {
        beforeDate = new Date(anchor.createdAt);
      }
    } else {
      const parsed = new Date(options.before);
      if (!Number.isNaN(parsed.getTime())) {
        beforeDate = parsed;
      }
    }

    if (beforeDate) {
      filter.createdAt = { $lt: beforeDate };
    }
  }

  const shouldUseWindowedQuery = pagination.hasPagination || Boolean(options.before);

  let query = Message.find(filter);
  if (shouldUseWindowedQuery) {
    query = query.sort({ createdAt: -1, _id: -1 });
    if (pagination.hasPagination) {
      query = query.skip(pagination.skip).limit(pagination.limit);
    }
  } else {
    query = query.sort({ createdAt: 1, _id: 1 });
  }

  const [rows, total] = await Promise.all([
    query.lean(),
    Message.countDocuments(filter),
  ]);

  const orderedRows = shouldUseWindowedQuery ? rows.reverse() : rows;
  return {
    messages: orderedRows.map(formatMessage),
    pagination: buildPagination({
      page: pagination.page,
      limit: pagination.limit,
      total,
      hasPagination: pagination.hasPagination,
    }),
  };
};

export const sendMessage = async (userId, chatId, text) => {
  if (!text || !text.trim()) {
    throw badRequest("Message text is required", "MESSAGE_TEXT_REQUIRED");
  }

  const session = await mongoose.startSession();
  let message;

  await session.withTransaction(async () => {
    const chat = await Chat.findById(chatId).session(session);
    if (!chat) throw notFound("Chat not found", "CHAT_NOT_FOUND");

    const isParticipant = chat.participants.some(
      (id) => id.toString() === userId.toString()
    );
    if (!isParticipant) throw forbidden("Not allowed", "CHAT_ACCESS_FORBIDDEN");

    if (chat.status !== "OPEN") {
      throw conflict("Chat is closed", "CHAT_CLOSED");
    }

    const [created] = await Message.create(
      [
        {
          chatId: chat._id,
          senderId: userId,
          text: text.trim(),
        },
      ],
      { session }
    );

    const now = new Date();
    const senderKey = userId.toString();
    const participantIds = chat.participants.map((id) => id.toString());
    const readStateByUser = toUserReadStateMap(chat);

    for (const participantId of participantIds) {
      const currentState = readStateByUser.get(participantId) || {
        unreadCount: 0,
        lastReadAt: null,
      };

      if (participantId === senderKey) {
        currentState.unreadCount = 0;
        currentState.lastReadAt = now;
      } else {
        currentState.unreadCount = Math.max(0, Number(currentState.unreadCount || 0)) + 1;
      }

      readStateByUser.set(participantId, currentState);
    }

    chat.readState = Array.from(readStateByUser.entries()).map(([participantId, state]) => ({
      userId: new mongoose.Types.ObjectId(participantId),
      unreadCount: Math.max(0, Number(state?.unreadCount || 0)),
      lastReadAt: state?.lastReadAt || null,
    }));

    chat.lastMessageAt = now;
    chat.lastMessageText = text.trim().slice(0, 500);
    await chat.save({ session });

    message = created;
  });

  session.endSession();
  return message;
};

export const markChatRead = async (userId, chatId) => {
  const chat = await Chat.findById(chatId);
  if (!chat) throw notFound("Chat not found", "CHAT_NOT_FOUND");

  const viewerId = userId.toString();
  const isParticipant = chat.participants.some(
    (id) => id.toString() === viewerId
  );
  if (!isParticipant) throw forbidden("Not allowed", "CHAT_ACCESS_FORBIDDEN");

  const now = new Date();
  const participantIds = chat.participants.map((id) => id.toString());
  const readStateByUser = toUserReadStateMap(chat);
  const current = readStateByUser.get(viewerId) || {
    unreadCount: 0,
    lastReadAt: null,
  };
  current.unreadCount = 0;
  current.lastReadAt = now;
  readStateByUser.set(viewerId, current);

  chat.readState = participantIds.map((participantId) => {
    const state = readStateByUser.get(participantId) || {
      unreadCount: 0,
      lastReadAt: null,
    };

    return {
      userId: new mongoose.Types.ObjectId(participantId),
      unreadCount: Math.max(0, Number(state.unreadCount || 0)),
      lastReadAt: state.lastReadAt || null,
    };
  });

  await chat.save();
  const summary = await getChatUnreadSummary(userId);

  return {
    chatId: chat._id.toString(),
    unread: 0,
    totalUnread: summary.unread,
    unreadByChatId: summary.unreadByChatId,
  };
};

export const deleteChatByRequestId = async (requestId, session = null) => {
  const chat = session
    ? await Chat.findOne({ requestId }).session(session)
    : await Chat.findOne({ requestId });

  if (!chat) return;

  const deleteMessages = session
    ? Message.deleteMany({ chatId: chat._id }, { session })
    : Message.deleteMany({ chatId: chat._id });
  const deleteChat = session
    ? Chat.deleteOne({ _id: chat._id }, { session })
    : Chat.deleteOne({ _id: chat._id });

  await Promise.all([deleteMessages, deleteChat]);
};

export const deleteChatsByRequestIds = async (requestIds, session = null) => {
  if (!requestIds?.length) return;

  const chats = session
    ? await Chat.find({ requestId: { $in: requestIds } })
        .select("_id")
        .session(session)
    : await Chat.find({ requestId: { $in: requestIds } }).select("_id");

  if (!chats.length) return;
  const chatIds = chats.map((c) => c._id);

  const deleteMessages = session
    ? Message.deleteMany({ chatId: { $in: chatIds } }, { session })
    : Message.deleteMany({ chatId: { $in: chatIds } });
  const deleteChats = session
    ? Chat.deleteMany({ _id: { $in: chatIds } }, { session })
    : Chat.deleteMany({ _id: { $in: chatIds } });

  await Promise.all([deleteMessages, deleteChats]);
};
