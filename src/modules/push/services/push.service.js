import admin from "firebase-admin";
import logger from "../../../utils/logger.js";
import { normalizeLanguage } from "../../../i18n/localization.js";
import PushToken from "../models/push-token.model.js";
import Chat from "../../chat/models/chat.model.js";
import User from "../../user/models/user.model.js";

const MAX_MESSAGES_PER_BATCH = 500;
const DEFAULT_CHANNEL_ID = "gifta_high_priority";

const parseBoolean = (value, fallback = null) => {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const MAX_ACTIVE_PUSH_TOKENS_PER_USER = parsePositiveInt(
  process.env.MAX_ACTIVE_PUSH_TOKENS_PER_USER,
  20
);

let messagingClient = null;
let messagingInitialized = false;

const toObjectIdString = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    if (value.id) return String(value.id);
    if (value._id) return value._id.toString();
  }
  return String(value);
};

const toNotificationData = (data = {}) => {
  const normalized = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    normalized[key] = String(value);
  }
  return normalized;
};

const splitBatches = (items, batchSize = MAX_MESSAGES_PER_BATCH) => {
  const batches = [];
  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }
  return batches;
};

const isInvalidTokenError = (error = null) => {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toUpperCase();

  if (code.includes("registration-token-not-registered")) return true;
  if (code.includes("invalid-registration-token")) return true;
  if (code.includes("invalid-argument")) return true;
  if (message.includes("UNREGISTERED")) return true;
  if (message.includes("INVALID_ARGUMENT")) return true;

  return false;
};

const getMessagingClient = () => {
  if (messagingInitialized) return messagingClient;
  messagingInitialized = true;

  const projectId = process.env.FCM_PROJECT_ID || "";
  const clientEmail = process.env.FCM_CLIENT_EMAIL || "";
  const privateKey = (process.env.FCM_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const envToggle = parseBoolean(process.env.FCM_ENABLED, null);
  const hasCredentials = Boolean(projectId && clientEmail && privateKey);

  if (envToggle === false) {
    logger.info("FCM is disabled by FCM_ENABLED=false");
    return null;
  }

  if (!hasCredentials) {
    if (envToggle === true) {
      logger.warn(
        "FCM_ENABLED=true but Firebase credentials are missing; push delivery is disabled"
      );
    }
    return null;
  }

  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    }

    messagingClient = admin.messaging();
    logger.info("Firebase messaging initialized");
    return messagingClient;
  } catch (error) {
    logger.error({ err: error }, "Failed to initialize Firebase messaging");
    messagingClient = null;
    return null;
  }
};

const enforceUserTokenLimit = async (userId) => {
  const activeTokens = await PushToken.find({
    userId,
    isActive: true,
  })
    .sort({ lastSeenAt: -1, updatedAt: -1, _id: -1 })
    .select("_id")
    .lean();

  if (activeTokens.length <= MAX_ACTIVE_PUSH_TOKENS_PER_USER) return;

  const overflow = activeTokens
    .slice(MAX_ACTIVE_PUSH_TOKENS_PER_USER)
    .map((entry) => entry._id);

  if (!overflow.length) return;

  await PushToken.updateMany(
    { _id: { $in: overflow } },
    {
      $set: {
        isActive: false,
        invalidatedAt: new Date(),
        lastErrorCode: "MAX_ACTIVE_PUSH_TOKENS_REACHED",
      },
    }
  );
};

export const registerPushToken = async ({
  userId,
  token,
  deviceId,
  platform = "unknown",
  appVersion = "",
  locale = "",
}) => {
  const now = new Date();

  await PushToken.updateMany(
    {
      token,
      $or: [{ userId: { $ne: userId } }, { deviceId: { $ne: deviceId } }],
    },
    {
      $set: {
        isActive: false,
        invalidatedAt: now,
        lastErrorCode: "TOKEN_REASSIGNED",
      },
    }
  );

  const row = await PushToken.findOneAndUpdate(
    { userId, deviceId },
    {
      $set: {
        token,
        platform,
        appVersion,
        locale: normalizeLanguage(locale, "en"),
        isActive: true,
        invalidatedAt: null,
        lastErrorCode: "",
        lastSeenAt: now,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  await enforceUserTokenLimit(userId);

  logger.info(
    {
      userId: toObjectIdString(userId),
      deviceId,
      platform,
    },
    "Push token registered"
  );

  return {
    id: row?._id?.toString?.() || "",
    userId: toObjectIdString(row?.userId),
    deviceId: row?.deviceId || "",
    platform: row?.platform || "unknown",
    isActive: Boolean(row?.isActive),
    updatedAt: row?.updatedAt || now,
  };
};

export const removePushTokenByDevice = async ({ userId, deviceId }) => {
  const result = await PushToken.updateMany(
    { userId, deviceId, isActive: true },
    {
      $set: {
        isActive: false,
        invalidatedAt: new Date(),
        lastErrorCode: "TOKEN_REMOVED_BY_USER",
      },
    }
  );

  logger.info(
    {
      userId: toObjectIdString(userId),
      deviceId,
      deleted: result.modifiedCount > 0,
    },
    "Push token removed by device"
  );

  return {
    deleted: result.modifiedCount > 0,
    deviceId,
  };
};

export const sendPushToUsers = async ({
  userIds = [],
  title = "",
  body = "",
  data = {},
  actorId = null,
  resolveLocalizedContent = null,
}) => {
  const normalizedUserIds = Array.from(
    new Set(userIds.map(toObjectIdString).filter(Boolean))
  );

  if (!normalizedUserIds.length) {
    return { delivered: false, sent: 0, failed: 0, invalidated: 0 };
  }

  const rows = await PushToken.find({
    userId: { $in: normalizedUserIds },
    isActive: true,
  })
    .select("_id token userId locale")
    .lean();

  if (!rows.length) {
    return { delivered: false, sent: 0, failed: 0, invalidated: 0 };
  }

  const uniqueRows = [];
  const seenTokens = new Set();
  for (const row of rows) {
    const token = row?.token;
    if (!token || seenTokens.has(token)) continue;
    seenTokens.add(token);
    uniqueRows.push(row);
  }

  const missingLocaleUserIds = Array.from(
    new Set(
      uniqueRows
        .filter((row) => !normalizeLanguage(row?.locale, ""))
        .map((row) => toObjectIdString(row?.userId))
        .filter(Boolean)
    )
  );

  const userLocaleById = new Map();
  if (missingLocaleUserIds.length > 0) {
    const users = await User.find({ _id: { $in: missingLocaleUserIds } })
      .select("_id preferredLanguage")
      .lean();
    users.forEach((user) => {
      userLocaleById.set(
        toObjectIdString(user?._id),
        normalizeLanguage(user?.preferredLanguage, "en")
      );
    });
  }

  const messaging = getMessagingClient();
  if (!messaging) {
    logger.warn(
      {
        type: data?.type || "GENERIC",
        recipients: uniqueRows.length,
      },
      "Push skipped because Firebase messaging is not initialized"
    );
    return {
      delivered: false,
      sent: 0,
      failed: uniqueRows.length,
      invalidated: 0,
      disabled: true,
    };
  }

  logger.info(
    {
      type: data?.type || "GENERIC",
      recipients: uniqueRows.length,
      users: normalizedUserIds.length,
    },
    "Push send started"
  );

  const actorKey = toObjectIdString(actorId);
  const messages = uniqueRows.map((row) => {
    const recipientUserId = toObjectIdString(row.userId);
    const locale = normalizeLanguage(
      row.locale || userLocaleById.get(recipientUserId),
      "en"
    );
    const localized =
      typeof resolveLocalizedContent === "function"
        ? resolveLocalizedContent({ locale, userId: recipientUserId }) || {}
        : { title, body };

    return {
      token: row.token,
      notification: {
        title: String(localized.title || title || "").slice(0, 120),
        body: String(localized.body || body || "").slice(0, 500),
      },
      data: toNotificationData({
        ...data,
        source: actorKey && actorKey === recipientUserId ? "mine" : "incoming",
      }),
      android: {
        priority: "high",
        notification: {
          channelId: DEFAULT_CHANNEL_ID,
        },
      },
      apns: {
        headers: {
          "apns-priority": "10",
          "apns-push-type": "alert",
        },
        payload: {
          aps: {
            sound: "default",
          },
        },
      },
    };
  });

  let sent = 0;
  let failed = 0;
  const invalidTokens = new Set();

  for (const batch of splitBatches(messages, MAX_MESSAGES_PER_BATCH)) {
    const response = await messaging.sendEach(batch);
    response.responses.forEach((entry, index) => {
      if (entry.success) {
        sent += 1;
        return;
      }

      failed += 1;
      if (isInvalidTokenError(entry.error)) {
        invalidTokens.add(batch[index].token);
      }
    });
  }

  if (invalidTokens.size > 0) {
    await PushToken.updateMany(
      { token: { $in: Array.from(invalidTokens) } },
      {
        $set: {
          isActive: false,
          invalidatedAt: new Date(),
          lastErrorCode: "FCM_UNREGISTERED_OR_INVALID_ARGUMENT",
        },
      }
    );
  }

  if (failed > 0) {
    logger.warn(
      {
        type: data?.type || "GENERIC",
        sent,
        failed,
        invalidated: invalidTokens.size,
      },
      "Push send completed with failures"
    );
  } else {
    logger.info(
      {
        type: data?.type || "GENERIC",
        sent,
        failed,
        invalidated: invalidTokens.size,
      },
      "Push send completed"
    );
  }

  return {
    delivered: sent > 0,
    sent,
    failed,
    invalidated: invalidTokens.size,
  };
};

export const sendPushToUsersSafe = async (payload) => {
  try {
    return await sendPushToUsers(payload);
  } catch (error) {
    logger.warn(
      {
        err: error,
        type: payload?.data?.type || "GENERIC",
      },
      "Push send failed"
    );
    return { delivered: false, sent: 0, failed: 0, invalidated: 0 };
  }
};

const REQUEST_PUSH_COPY = {
  en: {
    REQUEST_CREATED: ({ requesterName, itemTitle, requestType }) => ({
      title: "New request",
      body: `${requesterName || "User"} sent a ${requestType} request for "${itemTitle}"`,
    }),
    REQUEST_APPROVED: ({ itemTitle }) => ({
      title: "Request approved",
      body: `Request for "${itemTitle}" was approved`,
    }),
    REQUEST_REJECTED: ({ itemTitle }) => ({
      title: "Request rejected",
      body: `Request for "${itemTitle}" was rejected`,
    }),
    REQUEST_COMPLETED: ({ itemTitle }) => ({
      title: "Request completed",
      body: `"${itemTitle}" request is completed`,
    }),
    REQUEST_CANCELED: ({ itemTitle }) => ({
      title: "Request canceled",
      body: `"${itemTitle}" request was canceled`,
    }),
    REQUEST_EXPIRED: ({ itemTitle }) => ({
      title: "Request expired",
      body: `"${itemTitle}" request has expired`,
    }),
  },
  ka: {
    REQUEST_CREATED: ({ requesterName, itemTitle, requestType }) => ({
      title: "ახალი მოთხოვნა",
      body: `${requesterName || "მომხმარებელმა"} გამოგიგზავნათ ${requestType} მოთხოვნა: "${itemTitle}"`,
    }),
    REQUEST_APPROVED: ({ itemTitle }) => ({
      title: "მოთხოვნა დამტკიცდა",
      body: `"${itemTitle}" მოთხოვნა დამტკიცებულია`,
    }),
    REQUEST_REJECTED: ({ itemTitle }) => ({
      title: "მოთხოვნა უარყოფილია",
      body: `"${itemTitle}" მოთხოვნა უარყოფილია`,
    }),
    REQUEST_COMPLETED: ({ itemTitle }) => ({
      title: "მოთხოვნა დასრულდა",
      body: `"${itemTitle}" მოთხოვნა დასრულებულია`,
    }),
    REQUEST_CANCELED: ({ itemTitle }) => ({
      title: "მოთხოვნა გაუქმდა",
      body: `"${itemTitle}" მოთხოვნა გაუქმდა`,
    }),
    REQUEST_EXPIRED: ({ itemTitle }) => ({
      title: "მოთხოვნას ვადა გაუვიდა",
      body: `"${itemTitle}" მოთხოვნას ვადა გაუვიდა`,
    }),
  },
};

export const sendRequestLifecyclePushSafe = async ({
  event,
  request,
  actorId = null,
}) => {
  if (!request) return;

  const ownerId = toObjectIdString(request.ownerId || request.owner?.id);
  const requesterId = toObjectIdString(request.requesterId || request.requester?.id);
  const actorKey = toObjectIdString(actorId);
  const recipientsByEvent = {
    REQUEST_CREATED: [ownerId],
    REQUEST_APPROVED: [requesterId],
    REQUEST_REJECTED: [requesterId],
    REQUEST_COMPLETED: [ownerId, requesterId],
    REQUEST_CANCELED: [ownerId, requesterId],
    REQUEST_EXPIRED: [ownerId, requesterId],
  };
  const userIds = Array.from(
    new Set((recipientsByEvent[event] || [ownerId, requesterId]).filter(Boolean))
  ).filter((userId) => !actorKey || userId !== actorKey);
  if (!userIds.length) return;

  const itemTitle =
    request.itemDetails?.title ||
    request.item?.title ||
    request.itemSnapshot?.title ||
    "item";
  const requesterName = request.requesterName || "User";
  const requestType = String(request.type || "request").toLowerCase();

  await sendPushToUsersSafe({
    userIds,
    actorId,
    data: {
      type: "REQUEST_UPDATED",
      event,
      senderId: actorKey,
      requestId: toObjectIdString(request.id || request._id),
      itemId: toObjectIdString(request.itemId),
      chatId: toObjectIdString(request.chatId),
    },
    resolveLocalizedContent: ({ locale }) => {
      const copyByEvent = REQUEST_PUSH_COPY[locale] || REQUEST_PUSH_COPY.en;
      const resolver = copyByEvent[event] || REQUEST_PUSH_COPY.en[event];
      if (typeof resolver !== "function") {
        return { title: "Request update", body: itemTitle };
      }
      return resolver({ requesterName, itemTitle, requestType });
    },
  });
};

export const sendChatMessagePushSafe = async ({ chatId, senderId, text }) => {
  try {
    const chat = await Chat.findById(chatId).select("participants requestId").lean();
    if (!chat?.participants?.length) return;

    const sender = await User.findById(senderId)
      .select("firstName lastName")
      .lean();
    const senderName = [sender?.firstName, sender?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    const senderKey = toObjectIdString(senderId);
    const userIds = Array.from(
      new Set(chat.participants.map(toObjectIdString).filter(Boolean))
    ).filter((participantId) => participantId !== senderKey);
    if (!userIds.length) return;

    await sendPushToUsersSafe({
      userIds,
      actorId: senderId,
      data: {
        type: "CHAT_UPDATED",
        event: "MESSAGE_CREATED",
        senderId: senderKey,
        chatId: toObjectIdString(chatId),
        requestId: toObjectIdString(chat.requestId),
      },
      resolveLocalizedContent: ({ locale }) => {
        if (locale === "ka") {
          return {
            title: senderName || "ახალი შეტყობინება",
            body: String(text || "").trim().slice(0, 500),
          };
        }
        return {
          title: senderName || "New message",
          body: String(text || "").trim().slice(0, 500),
        };
      },
    });
  } catch (error) {
    logger.warn({ err: error }, "Chat push send failed");
  }
};
