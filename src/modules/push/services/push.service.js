import admin from "firebase-admin";
import logger from "../../../utils/logger.js";
import PushToken from "../models/push-token.model.js";
import Chat from "../../chat/models/chat.model.js";
import User from "../../user/models/user.model.js";

const MAX_MULTICAST_SIZE = 500;

const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
  "messaging/mismatched-credential",
]);

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

const splitBatches = (items, batchSize = MAX_MULTICAST_SIZE) => {
  const batches = [];
  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }
  return batches;
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

  if (activeTokens.length <= MAX_ACTIVE_PUSH_TOKENS_PER_USER) {
    return;
  }

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

  let row;
  try {
    row = await PushToken.findOneAndUpdate(
      { userId, deviceId },
      {
        $set: {
          token,
          platform,
          appVersion,
          locale,
          isActive: true,
          invalidatedAt: null,
          lastErrorCode: "",
          lastSeenAt: now,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    row = await PushToken.findOneAndUpdate(
      { userId, deviceId },
      {
        $set: {
          token,
          platform,
          appVersion,
          locale,
          isActive: true,
          invalidatedAt: null,
          lastErrorCode: "",
          lastSeenAt: now,
        },
      },
      { new: true }
    );
  }

  await enforceUserTokenLimit(userId);

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
    .select("_id token userId")
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

  const messaging = getMessagingClient();
  if (!messaging) {
    return {
      delivered: false,
      sent: 0,
      failed: uniqueRows.length,
      invalidated: 0,
      disabled: true,
    };
  }

  let sent = 0;
  let failed = 0;
  const invalidTokens = new Set();
  const payloadData = toNotificationData(data);
  const batches = splitBatches(uniqueRows, MAX_MULTICAST_SIZE);

  for (const batch of batches) {
    const tokenBatch = batch.map((row) => row.token);
    const response = await messaging.sendEachForMulticast({
      tokens: tokenBatch,
      notification: {
        title: String(title || "").slice(0, 120),
        body: String(body || "").slice(0, 500),
      },
      data: payloadData,
    });

    response.responses.forEach((entry, index) => {
      if (entry.success) {
        sent += 1;
        return;
      }

      failed += 1;
      const code = entry.error?.code || "";
      if (INVALID_TOKEN_CODES.has(code)) {
        invalidTokens.add(tokenBatch[index]);
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
          lastErrorCode: "INVALID_FCM_TOKEN",
        },
      }
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
    logger.warn({ err: error }, "Push send failed");
    return { delivered: false, sent: 0, failed: 0, invalidated: 0 };
  }
};

export const sendRequestLifecyclePushSafe = async ({
  event,
  request,
  actorId = null,
}) => {
  if (!request) return;

  const ownerId = toObjectIdString(request.ownerId || request.owner?.id);
  const requesterId = toObjectIdString(request.requesterId || request.requester?.id);
  const itemTitle =
    request.itemDetails?.title ||
    request.item?.title ||
    request.itemSnapshot?.title ||
    "item";
  const actorKey = toObjectIdString(actorId);

  const payloadByEvent = {
    REQUEST_CREATED: {
      userIds: [ownerId],
      title: "New request",
      body: `${request.requesterName || "User"} sent a ${String(
        request.type || "request"
      ).toLowerCase()} request for "${itemTitle}"`,
    },
    REQUEST_APPROVED: {
      userIds: [requesterId],
      title: "Request approved",
      body: `Your request for "${itemTitle}" was approved`,
    },
    REQUEST_REJECTED: {
      userIds: [requesterId],
      title: "Request rejected",
      body: `Your request for "${itemTitle}" was rejected`,
    },
    REQUEST_COMPLETED: {
      userIds: [ownerId, requesterId],
      title: "Request completed",
      body: `"${itemTitle}" request is completed`,
    },
    REQUEST_CANCELED: {
      userIds: [ownerId, requesterId],
      title: "Request canceled",
      body: `"${itemTitle}" request was canceled`,
    },
    REQUEST_EXPIRED: {
      userIds: [ownerId, requesterId],
      title: "Request expired",
      body: `"${itemTitle}" request has expired`,
    },
  };

  const config = payloadByEvent[event];
  if (!config) return;

  const recipients = config.userIds
    .map(toObjectIdString)
    .filter(Boolean)
    .filter((userId) => !actorKey || userId !== actorKey);

  if (!recipients.length) return;

  await sendPushToUsersSafe({
    userIds: recipients,
    title: config.title,
    body: config.body,
    data: {
      type: "REQUEST_UPDATED",
      event,
      requestId: toObjectIdString(request.id || request._id),
      itemId: toObjectIdString(request.itemId),
      offeredItemId: toObjectIdString(request.offeredItemId),
      status: request.status || "",
      chatId: toObjectIdString(request.chatId),
    },
  });
};

export const sendChatMessagePushSafe = async ({
  chatId,
  senderId,
  text,
}) => {
  try {
    const chat = await Chat.findById(chatId).select("participants").lean();
    if (!chat?.participants?.length) return;

    const sender = await User.findById(senderId)
      .select("firstName lastName")
      .lean();
    const senderName = [sender?.firstName, sender?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    const recipients = chat.participants
      .map(toObjectIdString)
      .filter(Boolean)
      .filter((id) => id !== toObjectIdString(senderId));

    if (!recipients.length) return;

    await sendPushToUsersSafe({
      userIds: recipients,
      title: senderName || "New message",
      body: String(text || "").trim().slice(0, 500),
      data: {
        type: "CHAT_UPDATED",
        event: "MESSAGE_CREATED",
        chatId: toObjectIdString(chatId),
        senderId: toObjectIdString(senderId),
      },
    });
  } catch (error) {
    logger.warn({ err: error }, "Chat push send failed");
  }
};
