import mongoose from "mongoose";
import { badRequest, conflict, forbidden, notFound } from "../../../utils/appError.js";
import logger from "../../../utils/logger.js";
import User from "../../user/models/user.model.js";
import Category from "../models/category.model.js";
import Location from "../models/location.model.js";
import Item from "../models/item.model.js";
import Notification from "../models/notification.model.js";
import ItemRequest from "../models/request.model.js";
import ItemTransaction from "../models/transaction.model.js";
import { deleteChatByRequestId, deleteChatsByRequestIds } from "../../chat/services/chat.service.js";
import {
  ensureWeeklyGiftLimit,
} from "./gift-limit.service.js";
import { createMarketplaceEvents } from "./event-log.service.js";
import {
  extractItemLocation,
  formatCategory,
  formatItemWithOwner,
  getItemSnapshot,
  historyTransactionPopulate,
  isValidDate,
  itemPopulate,
  normalizeHistoryItemDetails,
  normalizeLocationCountries,
  requestPopulate,
  toObjectIdString,
} from "./marketplace.presenters.js";
import {
  attachViewerRequestState,
} from "./marketplace.viewer-guard.service.js";
import {
  getRequestWithNames,
  getRequestsWithNames,
} from "./marketplace.request-read.service.js";
import {
  buildEmptyPaginatedResult,
  buildHistorySort,
  buildItemSort,
  buildPagination,
  parseObjectIdListFilter,
  parsePagination,
} from "./marketplace.query.js";
import {
  ACTIVE_REQUEST_STATUSES,
  MAX_ACTIVE_EXCHANGE_ITEMS,
  MAX_ACTIVE_GIFT_ITEMS,
  REQUEST_CANCELLATION_REASONS,
  REQUEST_EXPIRE_MS,
} from "./marketplace.constants.js";

export { formatRequestWithUsers, resolveViewerRequestState } from "./marketplace.presenters.js";
export { deriveGiftPolicyOwnerState } from "./marketplace.viewer-guard.service.js";

const createNotifications = async (entries, session) => {
  if (!entries.length) return;
  await Notification.insertMany(entries, { session });
};

const shouldHideAutoCanceledConflict = (options = {}) =>
  options.includeAutoCanceled !== true;

export const applyAutoCanceledVisibilityFilter = (filter, options = {}) => {
  if (!shouldHideAutoCanceledConflict(options)) {
    return filter;
  }

  return {
    ...filter,
    cancellationReason: {
      $ne: REQUEST_CANCELLATION_REASONS.AUTO_CANCELED_CONFLICT,
    },
  };
};

const getActiveListingLimit = (mode) =>
  mode === "GIFT" ? MAX_ACTIVE_GIFT_ITEMS : MAX_ACTIVE_EXCHANGE_ITEMS;

const throwActiveListingLimitError = (mode, limit, activeCount = limit) => {
  if (mode === "GIFT") {
    throw conflict(
      `Active gift items limit reached (max ${limit})`,
      "GIFT_ACTIVE_LIMIT_REACHED",
      [
        { field: "limit", message: String(limit) },
        { field: "activeCount", message: String(activeCount) },
      ]
    );
  }

  throw conflict(
    `Active exchange items limit reached (max ${limit})`,
    "EXCHANGE_ACTIVE_LIMIT_REACHED",
    [
      { field: "limit", message: String(limit) },
      { field: "activeCount", message: String(activeCount) },
    ]
  );
};

const reserveActiveListingSlot = async ({ ownerId, mode, session }) => {
  const limit = getActiveListingLimit(mode);
  const field = mode === "GIFT" ? "stats.giving" : "stats.exchanging";

  const activeCount = await Item.countDocuments({
    ownerId,
    mode,
    status: "ACTIVE",
  }).session(session);

  if (activeCount >= limit) {
    throwActiveListingLimitError(mode, limit, activeCount);
  }

  const updateResult = await User.updateOne(
    { _id: ownerId, [field]: { $lt: limit } },
    { $inc: { [field]: 1 } },
    { session }
  );

  if (updateResult.modifiedCount > 0) {
    return;
  }

  const userExists = await User.exists({ _id: ownerId }).session(session);
  if (!userExists) {
    throw notFound("User not found", "USER_NOT_FOUND");
  }

  const refreshedCount = await Item.countDocuments({
    ownerId,
    mode,
    status: "ACTIVE",
  }).session(session);
  if (refreshedCount >= limit) {
    throwActiveListingLimitError(mode, limit, refreshedCount);
  }

  throw conflict("User stats are inconsistent", "STATS_INCONSISTENT");
};

const resolveAndValidateLocation = async ({
  countryId,
  cityId,
  requireActive = true,
  session = null,
}) => {
  if (!mongoose.Types.ObjectId.isValid(countryId)) {
    throw badRequest("Validation error", "VALIDATION_ERROR", [
      { field: "countryId", message: "Country is invalid" },
    ]);
  }

  if (!mongoose.Types.ObjectId.isValid(cityId)) {
    throw badRequest("Validation error", "VALIDATION_ERROR", [
      { field: "cityId", message: "City is invalid" },
    ]);
  }

  let query = Location.findById(countryId);
  if (session) query = query.session(session);
  const country = await query.lean();

  if (!country || (requireActive && !country.isActive)) {
    throw badRequest("Validation error", "VALIDATION_ERROR", [
      { field: "countryId", message: "Country not found" },
    ]);
  }

  const city = country.cities?.find(
    (entry) => entry?._id?.toString?.() === toObjectIdString(cityId)
  );

  if (!city || (requireActive && !city.isActive)) {
    throw badRequest("Validation error", "VALIDATION_ERROR", [
      { field: "cityId", message: "City not found for selected country" },
    ]);
  }

  return { country, city };
};

const getItemWithOwner = async (itemId) => {
  const item = await Item.findById(itemId).populate(itemPopulate).lean();
  return formatItemWithOwner(item);
};

const getItemsWithOwner = async (filter, options = {}) => {
  const pagination = parsePagination(options);
  const sort = buildItemSort(options.sort);

  let query = Item.find(filter)
    .sort(sort)
    .populate(itemPopulate);

  if (pagination.hasPagination) {
    query = query.skip(pagination.skip).limit(pagination.limit);
  }

  const [items, total] = await Promise.all([
    query.lean(),
    Item.countDocuments(filter),
  ]);

  return {
    items: items.map(formatItemWithOwner),
    pagination: buildPagination({
      page: pagination.page,
      limit: pagination.limit,
      total,
      hasPagination: pagination.hasPagination,
    }),
  };
};
const syncPendingRequestCountsForItems = async (itemIds, session) => {
  const normalizedIds = Array.from(
    new Set(
      (itemIds || [])
        .filter(Boolean)
        .map((id) => id.toString())
    )
  );

  if (!normalizedIds.length) return;

  const counts = await ItemRequest.aggregate([
    {
      $match: {
        status: "PENDING",
        itemId: { $in: normalizedIds.map((id) => new mongoose.Types.ObjectId(id)) },
      },
    },
    {
      $group: {
        _id: "$itemId",
        count: { $sum: 1 },
      },
    },
  ]).session(session);

  const countByItemId = new Map(
    counts.map((entry) => [entry._id.toString(), entry.count])
  );

  await Promise.all(
    normalizedIds.map((id) =>
      Item.updateOne(
        { _id: id },
        { $set: { pendingRequestsCount: countByItemId.get(id) || 0 } },
        { session }
      )
    )
  );
};

const ensureNoDuplicateActiveRequest = async ({
  requesterId,
  itemId,
  session,
}) => {
  const duplicate = await ItemRequest.exists({
    requesterId,
    itemId,
    status: { $in: ACTIVE_REQUEST_STATUSES },
  }).session(session);

  if (duplicate) {
    throw conflict("Request is already in process for this item", "REQUEST_ALREADY_PENDING");
  }
};

export const isDuplicateActiveRequestMongoError = (err) => {
  if (!err || err.code !== 11000) return false;

  const keyPattern = err.keyPattern || {};
  if (keyPattern.requesterId && keyPattern.itemId) {
    return true;
  }

  const keyValue = err.keyValue || {};
  if (
    Object.prototype.hasOwnProperty.call(keyValue, "requesterId") &&
    Object.prototype.hasOwnProperty.call(keyValue, "itemId")
  ) {
    return true;
  }

  const message = String(err.message || "");
  return message.includes("requesterId_1_itemId_1");
};

export const buildCompetingRequestConflictMatch = ({
  approvedRequestId,
  reservedObjectIds,
}) => ({
  status: "PENDING",
  _id: { $ne: approvedRequestId },
  $or: [
    { itemId: { $in: reservedObjectIds } },
    { offeredItemId: { $in: reservedObjectIds } },
  ],
});

const autoCancelCompetingPendingRequests = async ({
  approvedRequestId,
  reservedItemIds,
  actorId,
  session,
}) => {
  const normalizedReservedIds = Array.from(
    new Set(
      (reservedItemIds || [])
        .filter(Boolean)
        .map((id) => id.toString())
    )
  );

  if (!normalizedReservedIds.length) {
    return { canceledCount: 0 };
  }

  const reservedObjectIds = normalizedReservedIds.map(
    (id) => new mongoose.Types.ObjectId(id)
  );

  const competingRequests = await ItemRequest.find(
    buildCompetingRequestConflictMatch({
      approvedRequestId,
      reservedObjectIds,
    })
  )
    .select("_id ownerId requesterId itemId offeredItemId")
    .session(session);

  if (!competingRequests.length) {
    await syncPendingRequestCountsForItems(normalizedReservedIds, session);
    return { canceledCount: 0 };
  }

  const now = new Date();
  const competingIds = competingRequests.map((request) => request._id);

  await ItemRequest.updateMany(
    { _id: { $in: competingIds } },
    {
      $set: {
        status: "CANCELED",
        respondedAt: now,
        expiresAt: null,
        chatId: null,
        cancellationReason: REQUEST_CANCELLATION_REASONS.AUTO_CANCELED_CONFLICT,
      },
    },
    { session }
  );

  const affectedItemIds = Array.from(
    new Set(
      competingRequests
        .map((request) => request.itemId?.toString?.())
        .filter(Boolean)
        .concat(normalizedReservedIds)
    )
  );

  await syncPendingRequestCountsForItems(affectedItemIds, session);

  await createNotifications(
    competingRequests.flatMap((request) => [
      {
        userId: request.ownerId,
        type: "CANCELED",
        actorId,
        requestId: request._id,
        itemId: request.itemId,
        offeredItemId: request.offeredItemId || null,
      },
      {
        userId: request.requesterId,
        type: "CANCELED",
        actorId,
        requestId: request._id,
        itemId: request.itemId,
        offeredItemId: request.offeredItemId || null,
      },
    ]),
    session
  );

  await createMarketplaceEvents(
    competingRequests.map((request) => ({
      type: "REQUEST_AUTO_CANCELED_CONFLICT",
      actorId,
      requestId: request._id,
      itemId: request.itemId || null,
      offeredItemId: request.offeredItemId || null,
      ownerId: request.ownerId,
      requesterId: request.requesterId,
      metadata: {
        reason: REQUEST_CANCELLATION_REASONS.AUTO_CANCELED_CONFLICT,
      },
    })),
    session
  );

  return { canceledCount: competingRequests.length };
};

const itemStatusError = (item) => {
  if (!item) throw notFound("Item not found", "ITEM_NOT_FOUND");

  if (item.status === "RESERVED") {
    throw conflict("Item is reserved", "ITEM_RESERVED");
  }
  if (item.status === "COMPLETED") {
    throw conflict("Item is completed", "ITEM_COMPLETED");
  }
  if (item.status === "REMOVED") {
    throw conflict("Item is removed", "ITEM_REMOVED");
  }

  throw conflict("Item not active", "ITEM_NOT_ACTIVE");
};

export const listCategories = async (locale = "en") => {
  const categories = await Category.find({ isActive: true })
    .sort({ order: 1, name: 1 })
    .lean();
  return categories.map((category) => formatCategory(category, locale));
};

export const listLocations = async (locale = "en") => {
  const countries = await Location.find({ isActive: true })
    .sort({ order: 1, name: 1 })
    .lean();
  return normalizeLocationCountries(countries, locale);
};

export const createItem = async (ownerId, payload) => {
  const category = await Category.findById(payload.categoryId).select("_id").lean();
  if (!category) {
    throw badRequest("Validation error", "VALIDATION_ERROR", [
      { field: "categoryId", message: "Category not found" },
    ]);
  }

  const session = await mongoose.startSession();
  let createdItemId;

  await session.withTransaction(async () => {
    await resolveAndValidateLocation({
      countryId: payload.countryId,
      cityId: payload.cityId,
      requireActive: true,
      session,
    });

    await reserveActiveListingSlot({
      ownerId,
      mode: payload.mode,
      session,
    });

    const [item] = await Item.create(
      [
        {
          ownerId,
          categoryId: payload.categoryId,
          countryId: payload.countryId,
          cityId: payload.cityId,
          address: payload.address?.trim() || "",
          title: payload.title.trim(),
          description: payload.description.trim(),
          mode: payload.mode,
          status: "ACTIVE",
          images: payload.images,
        },
      ],
      { session }
    );

    createdItemId = item._id;

    await createMarketplaceEvents(
      [
        {
          type: "ITEM_CREATED",
          actorId: ownerId,
          itemId: item._id,
          ownerId,
          metadata: {
            mode: item.mode,
            status: item.status,
          },
        },
      ],
      session
    );
  });

  session.endSession();
  return getItemWithOwner(createdItemId);
};

export const getActiveItems = async (options = {}, viewerId = null) => {
  const filter = { status: "ACTIVE" };

  if (options.mode) {
    filter.mode = options.mode;
  }

  if (options.search) {
    const escaped = options.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    filter.$or = [{ title: regex }, { description: regex }];
  }

  const categoryIdsFilter = parseObjectIdListFilter(options.categoryIds);
  if (categoryIdsFilter.hasInput && categoryIdsFilter.ids.length === 0) {
    return buildEmptyPaginatedResult(options, "items");
  }
  if (categoryIdsFilter.ids.length > 0) {
    filter.categoryId = { $in: categoryIdsFilter.ids };
  }

  const cityIdsFilter = parseObjectIdListFilter(options.cityIds);
  if (cityIdsFilter.hasInput && cityIdsFilter.ids.length === 0) {
    return buildEmptyPaginatedResult(options, "items");
  }
  if (cityIdsFilter.ids.length > 0) {
    filter.cityId = { $in: cityIdsFilter.ids };
  }

  const result = await getItemsWithOwner(filter, options);
  result.items = await attachViewerRequestState(result.items, viewerId);
  return result;
};

export const getItemById = async (itemId, viewerId = null) => {
  const item = await getItemWithOwner(itemId);
  if (!item) throw notFound("Item not found", "ITEM_NOT_FOUND");
  if (item.status === "REMOVED") {
    throw conflict("Item is removed", "ITEM_REMOVED");
  }
  const [itemWithViewerState] = await attachViewerRequestState([item], viewerId);
  return itemWithViewerState;
};

export const getMyItems = async (ownerId, options = {}) => {
  const filter = { ownerId, status: options.status || "ACTIVE" };

  if (options.mode) {
    filter.mode = options.mode;
  }

  return getItemsWithOwner(filter, options);
};

export const updateItem = async (ownerId, itemId, payload) => {
  const item = await Item.findById(itemId);
  if (!item) throw notFound("Item not found", "ITEM_NOT_FOUND");

  if (item.ownerId.toString() !== ownerId.toString()) {
    throw forbidden("Not allowed", "FORBIDDEN");
  }

  if (item.status !== "ACTIVE") {
    throw conflict("Item cannot be edited unless ACTIVE", "ITEM_EDIT_FORBIDDEN_STATUS");
  }

  if (payload.mode && payload.mode !== item.mode) {
    throw conflict("Item mode cannot be changed", "ITEM_MODE_IMMUTABLE");
  }

  if (payload.categoryId) {
    const category = await Category.findById(payload.categoryId).select("_id").lean();
    if (!category) {
      throw badRequest("Validation error", "VALIDATION_ERROR", [
        { field: "categoryId", message: "Category not found" },
      ]);
    }
    item.categoryId = payload.categoryId;
  }

  if (payload.countryId !== undefined || payload.cityId !== undefined) {
    await resolveAndValidateLocation({
      countryId: payload.countryId,
      cityId: payload.cityId,
      requireActive: true,
    });
    item.countryId = payload.countryId;
    item.cityId = payload.cityId;
  }

  if (payload.title !== undefined) item.title = payload.title.trim();
  if (payload.description !== undefined) item.description = payload.description.trim();
  if (payload.images !== undefined) item.images = payload.images;
  if (payload.address !== undefined) item.address = payload.address.trim();

  await item.save();
  return getItemWithOwner(item._id);
};

export const deleteItem = async (ownerId, itemId) => {
  const session = await mongoose.startSession();
  let updatedItem;

  await session.withTransaction(async () => {
    const item = await Item.findById(itemId).session(session);
    if (!item) throw notFound("Item not found", "ITEM_NOT_FOUND");

    if (item.ownerId.toString() !== ownerId.toString()) {
      throw forbidden("Not allowed", "FORBIDDEN");
    }

    if (item.status !== "ACTIVE") {
      if (item.status === "COMPLETED" && item.mode === "GIFT") {
        throw conflict(
          "Completed gifts can only be deleted by admin",
          "ITEM_DELETE_FORBIDDEN_COMPLETED_GIFT"
        );
      }
      throw conflict("Only ACTIVE items can be deleted", "ITEM_DELETE_FORBIDDEN_STATUS");
    }

    const owner = await User.findById(item.ownerId)
      .select("firstName lastName")
      .session(session)
      .lean();
    const deletedPayload = formatItemWithOwner({
      ...item.toObject(),
      ownerId: owner
        ? { _id: item.ownerId, firstName: owner.firstName, lastName: owner.lastName }
        : item.ownerId,
    });

    const inc =
      item.mode === "GIFT"
        ? { "stats.giving": -1 }
        : { "stats.exchanging": -1 };

    await User.updateOne({ _id: ownerId }, { $inc: inc }, { session });

    const now = new Date();
    const snapshot = getItemSnapshot(item);
    const lifecycleEvents = [];

    const pendingRequests = await ItemRequest.find({
      itemId: item._id,
      status: "PENDING",
    })
      .select("_id requesterId ownerId offeredItemId")
      .session(session);

    if (pendingRequests.length) {
      await ItemRequest.updateMany(
        { _id: { $in: pendingRequests.map((r) => r._id) } },
        {
          $set: {
            status: "CANCELED",
            respondedAt: now,
            cancellationReason: null,
            itemSnapshot: snapshot,
            expiresAt: null,
            chatId: null,
          },
        },
        { session }
      );

      await createNotifications(
        pendingRequests.map((req) => ({
          userId: req.requesterId,
          type: "CANCELED",
          actorId: ownerId,
          requestId: req._id,
          itemId: item._id,
          offeredItemId: req.offeredItemId || null,
        })),
        session
      );

      lifecycleEvents.push(
        ...pendingRequests.map((req) => ({
          type: "REQUEST_CANCELED",
          actorId: ownerId,
          requestId: req._id,
          itemId: req.itemId || item._id,
          offeredItemId: req.offeredItemId || null,
          ownerId: req.ownerId,
          requesterId: req.requesterId,
          metadata: { source: "ITEM_DELETED" },
        }))
      );
    }

    const approvedRequests = await ItemRequest.find({
      itemId: item._id,
      status: "APPROVED",
    })
      .select("_id requesterId ownerId offeredItemId")
      .session(session);

    if (approvedRequests.length) {
      await ItemRequest.updateMany(
        { _id: { $in: approvedRequests.map((r) => r._id) } },
        {
          $set: {
            status: "EXPIRED",
            respondedAt: now,
            cancellationReason: null,
            itemSnapshot: snapshot,
            expiresAt: null,
            chatId: null,
          },
        },
        { session }
      );

      await deleteChatsByRequestIds(
        approvedRequests.map((r) => r._id),
        session
      );

      await createNotifications(
        approvedRequests.flatMap((req) => [
          {
            userId: req.ownerId,
            type: "EXPIRED",
            actorId: ownerId,
            requestId: req._id,
            itemId: item._id,
            offeredItemId: req.offeredItemId || null,
          },
          {
            userId: req.requesterId,
            type: "EXPIRED",
            actorId: ownerId,
            requestId: req._id,
            itemId: item._id,
            offeredItemId: req.offeredItemId || null,
          },
        ]),
        session
      );

      lifecycleEvents.push(
        ...approvedRequests.map((req) => ({
          type: "REQUEST_EXPIRED",
          actorId: ownerId,
          requestId: req._id,
          itemId: req.itemId || item._id,
          offeredItemId: req.offeredItemId || null,
          ownerId: req.ownerId,
          requesterId: req.requesterId,
          metadata: { source: "ITEM_DELETED" },
        }))
      );
    }

    const pendingOfferedRequests = await ItemRequest.find({
      offeredItemId: item._id,
      status: "PENDING",
    })
      .select("_id requesterId ownerId itemId")
      .session(session);

    if (pendingOfferedRequests.length) {
      await ItemRequest.updateMany(
        { _id: { $in: pendingOfferedRequests.map((r) => r._id) } },
        {
          $set: {
            status: "CANCELED",
            respondedAt: now,
            cancellationReason: null,
            offeredItemSnapshot: snapshot,
            expiresAt: null,
            chatId: null,
          },
        },
        { session }
      );

      const countsByItem = pendingOfferedRequests.reduce((acc, req) => {
        const key = req.itemId.toString();
        acc.set(key, (acc.get(key) || 0) + 1);
        return acc;
      }, new Map());

      await Promise.all(
        Array.from(countsByItem.entries()).map(([itemKey, count]) =>
          Item.updateOne(
            { _id: itemKey },
            { $inc: { pendingRequestsCount: -count } },
            { session }
          )
        )
      );

      await createNotifications(
        pendingOfferedRequests.flatMap((req) => [
          {
            userId: req.ownerId,
            type: "CANCELED",
            actorId: ownerId,
            requestId: req._id,
            itemId: req.itemId,
            offeredItemId: item._id,
          },
          {
            userId: req.requesterId,
            type: "CANCELED",
            actorId: ownerId,
            requestId: req._id,
            itemId: req.itemId,
            offeredItemId: item._id,
          },
        ]),
        session
      );

      lifecycleEvents.push(
        ...pendingOfferedRequests.map((req) => ({
          type: "REQUEST_CANCELED",
          actorId: ownerId,
          requestId: req._id,
          itemId: req.itemId,
          offeredItemId: item._id,
          ownerId: req.ownerId,
          requesterId: req.requesterId,
          metadata: { source: "OFFERED_ITEM_DELETED" },
        }))
      );
    }

    const approvedOfferedRequests = await ItemRequest.find({
      offeredItemId: item._id,
      status: "APPROVED",
    })
      .select("_id requesterId ownerId itemId")
      .session(session);

    if (approvedOfferedRequests.length) {
      await ItemRequest.updateMany(
        { _id: { $in: approvedOfferedRequests.map((r) => r._id) } },
        {
          $set: {
            status: "EXPIRED",
            respondedAt: now,
            cancellationReason: null,
            offeredItemSnapshot: snapshot,
            expiresAt: null,
            chatId: null,
          },
        },
        { session }
      );

      await deleteChatsByRequestIds(
        approvedOfferedRequests.map((r) => r._id),
        session
      );

      await Promise.all(
        approvedOfferedRequests.map(async (req) => {
          const itemA = await Item.findById(req.itemId).session(session);
          if (itemA && itemA.reservedByRequestId?.toString() === req._id.toString()) {
            itemA.status = "ACTIVE";
            itemA.reservedByRequestId = null;
            itemA.pendingRequestsCount = 0;
            await itemA.save({ session });

            await User.updateOne(
              { _id: req.ownerId },
              { $inc: { "stats.exchanging": 1 } },
              { session }
            );
          }
        })
      );

      await createNotifications(
        approvedOfferedRequests.flatMap((req) => [
          {
            userId: req.ownerId,
            type: "EXPIRED",
            actorId: ownerId,
            requestId: req._id,
            itemId: req.itemId,
            offeredItemId: item._id,
          },
          {
            userId: req.requesterId,
            type: "EXPIRED",
            actorId: ownerId,
            requestId: req._id,
            itemId: req.itemId,
            offeredItemId: item._id,
          },
        ]),
        session
      );

      lifecycleEvents.push(
        ...approvedOfferedRequests.map((req) => ({
          type: "REQUEST_EXPIRED",
          actorId: ownerId,
          requestId: req._id,
          itemId: req.itemId,
          offeredItemId: item._id,
          ownerId: req.ownerId,
          requesterId: req.requesterId,
          metadata: { source: "OFFERED_ITEM_DELETED" },
        }))
      );
    }

    lifecycleEvents.push({
      type: "ITEM_DELETED",
      actorId: ownerId,
      itemId: item._id,
      ownerId: item.ownerId,
      metadata: {
        mode: item.mode,
      },
    });

    await createMarketplaceEvents(lifecycleEvents, session);

    await Item.deleteOne({ _id: item._id }, { session });

    updatedItem = deletedPayload;
  });

  session.endSession();
  return updatedItem;
};

export const createRequest = async (requesterId, itemId, payload) => {
  const session = await mongoose.startSession();
  let createdRequestId;
  try {
    await session.withTransaction(async () => {
      const item = await Item.findById(itemId).session(session);
      if (!item) throw notFound("Item not found", "ITEM_NOT_FOUND");

      if (item.ownerId.toString() === requesterId.toString()) {
        throw conflict("Cannot request your own item", "REQUEST_CANNOT_REQUEST_OWN_ITEM");
      }

      if (item.status !== "ACTIVE") {
        itemStatusError(item);
      }

      if (payload.type !== item.mode) {
        throw conflict("Request type does not match item", "REQUEST_INVALID_TYPE_FOR_ITEM");
      }

      await ensureNoDuplicateActiveRequest({
        requesterId,
        itemId: item._id,
        session,
      });

      if (payload.type === "GIFT") {
        await ensureWeeklyGiftLimit({
          ownerId: item.ownerId,
          receiverId: requesterId,
          includeApproved: true,
          session,
        });
      }

      let offeredItem = null;
      if (payload.type === "EXCHANGE") {
        if (!payload.offeredItemId) {
          throw badRequest("Offered item is required", "EXCHANGE_OFFER_ITEM_INVALID");
        }

        offeredItem = await Item.findById(payload.offeredItemId).session(session);
        if (!offeredItem) {
          throw badRequest("Offered item is invalid", "EXCHANGE_OFFER_ITEM_INVALID");
        }
        if (offeredItem.ownerId.toString() !== requesterId.toString()) {
          throw forbidden("Offered item not owned by requester", "EXCHANGE_OFFER_NOT_OWNED");
        }
        if (offeredItem.mode !== "EXCHANGE") {
          throw conflict("Offered item must be EXCHANGE", "EXCHANGE_MODE_REQUIRED");
        }
        if (offeredItem.status !== "ACTIVE") {
          throw conflict("Offered item not active", "EXCHANGE_OFFER_NOT_ACTIVE");
        }
      }

      const [request] = await ItemRequest.create(
        [
          {
            type: payload.type,
            status: "PENDING",
            itemId: item._id,
            ownerId: item.ownerId,
            requesterId,
            offeredItemId: offeredItem ? offeredItem._id : null,
            offeredOwnerId: offeredItem ? offeredItem.ownerId : null,
            message: payload.message || "",
            cancellationReason: null,
            itemSnapshot: getItemSnapshot(item),
            offeredItemSnapshot: offeredItem
              ? getItemSnapshot(offeredItem)
              : { title: "", imageUrl: "" },
          },
        ],
        { session }
      );

      item.pendingRequestsCount = (item.pendingRequestsCount || 0) + 1;
      await item.save({ session });

      await createNotifications(
        [
          {
            userId: item.ownerId,
            type: "REQUEST_CREATED",
            actorId: requesterId,
            requestId: request._id,
            itemId: item._id,
            offeredItemId: offeredItem ? offeredItem._id : null,
          },
        ],
        session
      );

      await createMarketplaceEvents(
        [
          {
            type: "REQUEST_CREATED",
            actorId: requesterId,
            requestId: request._id,
            itemId: item._id,
            offeredItemId: offeredItem ? offeredItem._id : null,
            ownerId: item.ownerId,
            requesterId,
            metadata: {
              type: request.type,
            },
          },
        ],
        session
      );

      createdRequestId = request._id;
    });
  } catch (err) {
    if (isDuplicateActiveRequestMongoError(err)) {
      throw conflict("Request is already in process for this item", "REQUEST_ALREADY_PENDING");
    }
    throw err;
  } finally {
    session.endSession();
  }

  return getRequestWithNames(createdRequestId);
};

export const getMyRequests = async (requesterId, options = {}) => {
  let filter = { requesterId };
  if (options.status) filter.status = options.status;
  if (options.type) filter.type = options.type;
  filter = applyAutoCanceledVisibilityFilter(filter, options);
  return getRequestsWithNames(filter, options);
};

export const getIncomingRequests = async (ownerId, options = {}) => {
  let filter = { ownerId };
  if (options.status) filter.status = options.status;
  if (options.type) filter.type = options.type;
  filter = applyAutoCanceledVisibilityFilter(filter, options);
  return getRequestsWithNames(filter, options);
};

export const respondToRequest = async (ownerId, requestId, action) => {
  const session = await mongoose.startSession();
  let updatedRequestId;

  await session.withTransaction(async () => {
    const request = await ItemRequest.findById(requestId).session(session);
    if (!request) throw notFound("Request not found", "REQUEST_NOT_FOUND");

    if (request.ownerId.toString() !== ownerId.toString()) {
      throw forbidden("Not allowed", "REQUEST_NOT_PARTICIPANT");
    }

    if (request.status !== "PENDING") {
      throw conflict("Request is not pending", "REQUEST_NOT_PENDING");
    }

    if (action === "reject") {
      request.status = "REJECTED";
      request.respondedAt = new Date();
      request.expiresAt = null;
      request.cancellationReason = null;
      await request.save({ session });

      const item = await Item.findById(request.itemId).session(session);
      if (item) {
        const nextCount = Math.max(0, (item.pendingRequestsCount || 0) - 1);
        item.pendingRequestsCount = nextCount;
        await item.save({ session });
      }

      await createNotifications(
        [
          {
            userId: request.requesterId,
            type: "REQUEST_REJECTED",
            actorId: ownerId,
            requestId: request._id,
            itemId: request.itemId,
            offeredItemId: request.offeredItemId || null,
          },
        ],
        session
      );

      await createMarketplaceEvents(
        [
          {
            type: "REQUEST_REJECTED",
            actorId: ownerId,
            requestId: request._id,
            itemId: request.itemId,
            offeredItemId: request.offeredItemId || null,
            ownerId: request.ownerId,
            requesterId: request.requesterId,
          },
        ],
        session
      );

      await deleteChatByRequestId(request._id, session);

      updatedRequestId = request._id;
      return;
    }

    const itemA = await Item.findById(request.itemId).session(session);
    if (!itemA) throw notFound("Item not found", "ITEM_NOT_FOUND");

    if (itemA.status !== "ACTIVE") {
      itemStatusError(itemA);
    }

    if (request.type !== itemA.mode) {
      throw conflict("Request type does not match item", "REQUEST_INVALID_TYPE_FOR_ITEM");
    }

    let itemB = null;
    if (request.type === "EXCHANGE") {
      if (!request.offeredItemId) {
        throw badRequest("Offered item is required", "EXCHANGE_OFFER_ITEM_INVALID");
      }

      itemB = await Item.findById(request.offeredItemId).session(session);
      if (!itemB) {
        throw badRequest("Offered item is invalid", "EXCHANGE_OFFER_ITEM_INVALID");
      }
      if (itemB.ownerId.toString() !== request.requesterId.toString()) {
        throw forbidden("Offered item not owned by requester", "EXCHANGE_OFFER_NOT_OWNED");
      }
      if (itemB.mode !== "EXCHANGE") {
        throw conflict("Offered item must be EXCHANGE", "EXCHANGE_MODE_REQUIRED");
      }
      if (itemB.status !== "ACTIVE") {
        throw conflict("Offered item not active", "EXCHANGE_OFFER_NOT_ACTIVE");
      }
    }

    if (request.type === "GIFT") {
      await ensureWeeklyGiftLimit({
        ownerId: request.ownerId,
        receiverId: request.requesterId,
        includeApproved: true,
        session,
      });
    }

    const now = new Date();
    request.status = "APPROVED";
    request.approvedAt = now;
    request.cancellationReason = null;
    const expiresAt = new Date(now.getTime() + REQUEST_EXPIRE_MS);
    if (!isValidDate(expiresAt)) {
      logger.warn(
        { requestId: request._id, REQUEST_EXPIRE_HOURS },
        "Computed invalid expiresAt; leaving unset"
      );
      request.expiresAt = undefined;
    } else {
      request.expiresAt = expiresAt;
    }
    request.respondedAt = now;
    await request.save({ session });

    itemA.status = "RESERVED";
    itemA.reservedByRequestId = request._id;
    itemA.pendingRequestsCount = 0;
    await itemA.save({ session });

    if (itemB) {
      itemB.status = "RESERVED";
      itemB.reservedByRequestId = request._id;
      itemB.pendingRequestsCount = 0;
      await itemB.save({ session });
    }

    await autoCancelCompetingPendingRequests({
      approvedRequestId: request._id,
      reservedItemIds: [itemA._id, itemB?._id].filter(Boolean),
      actorId: ownerId,
      session,
    });

    if (request.type === "GIFT") {
      await User.updateOne(
        { _id: request.ownerId },
        { $inc: { "stats.giving": -1 } },
        { session }
      );
    } else {
      await User.updateOne(
        { _id: request.ownerId },
        { $inc: { "stats.exchanging": -1 } },
        { session }
      );
      await User.updateOne(
        { _id: request.requesterId },
        { $inc: { "stats.exchanging": -1 } },
        { session }
      );
    }

    await createNotifications(
      [
        {
          userId: request.requesterId,
          type: "REQUEST_APPROVED",
          actorId: ownerId,
          requestId: request._id,
          itemId: itemA._id,
          offeredItemId: itemB ? itemB._id : null,
        },
        {
          userId: request.ownerId,
          type: "CONFIRM_NEEDED",
          actorId: ownerId,
          requestId: request._id,
          itemId: itemA._id,
          offeredItemId: itemB ? itemB._id : null,
        },
        {
          userId: request.requesterId,
          type: "CONFIRM_NEEDED",
          actorId: ownerId,
          requestId: request._id,
          itemId: itemA._id,
          offeredItemId: itemB ? itemB._id : null,
        },
      ],
      session
    );

    await createMarketplaceEvents(
      [
        {
          type: "REQUEST_APPROVED",
          actorId: ownerId,
          requestId: request._id,
          itemId: itemA._id,
          offeredItemId: itemB ? itemB._id : null,
          ownerId: request.ownerId,
          requesterId: request.requesterId,
          metadata: {
            type: request.type,
            expiresAt: request.expiresAt || null,
          },
        },
      ],
      session
    );

    updatedRequestId = request._id;
  });

  session.endSession();
  return getRequestWithNames(updatedRequestId);
};

const expireApprovedRequestAndRestoreItems = async ({
  request,
  itemA,
  itemB,
  actorId,
  session,
  now,
  source = "APPROVAL_EXPIRED",
}) => {
  request.status = "EXPIRED";
  request.respondedAt = now;
  request.cancellationReason = null;
  request.chatId = null;
  await request.save({ session });

  if (itemA && itemA.reservedByRequestId?.toString() === request._id.toString()) {
    itemA.status = "ACTIVE";
    itemA.reservedByRequestId = null;
    await itemA.save({ session });

    if (request.type === "GIFT") {
      await User.updateOne(
        { _id: request.ownerId },
        { $inc: { "stats.giving": 1 } },
        { session }
      );
    } else {
      await User.updateOne(
        { _id: request.ownerId },
        { $inc: { "stats.exchanging": 1 } },
        { session }
      );
    }
  }

  if (itemB && itemB.reservedByRequestId?.toString() === request._id.toString()) {
    itemB.status = "ACTIVE";
    itemB.reservedByRequestId = null;
    await itemB.save({ session });

    await User.updateOne(
      { _id: request.requesterId },
      { $inc: { "stats.exchanging": 1 } },
      { session }
    );
  }

  await createNotifications(
    [
      {
        userId: request.ownerId,
        type: "EXPIRED",
        actorId,
        requestId: request._id,
        itemId: request.itemId,
        offeredItemId: request.offeredItemId || null,
      },
      {
        userId: request.requesterId,
        type: "EXPIRED",
        actorId,
        requestId: request._id,
        itemId: request.itemId,
        offeredItemId: request.offeredItemId || null,
      },
    ],
    session
  );

  await createMarketplaceEvents(
    [
      {
        type: "REQUEST_EXPIRED",
        actorId,
        requestId: request._id,
        itemId: request.itemId,
        offeredItemId: request.offeredItemId || null,
        ownerId: request.ownerId,
        requesterId: request.requesterId,
        metadata: { source },
      },
    ],
    session
  );

  await deleteChatByRequestId(request._id, session);
};

export const confirmRequest = async (userId, requestId) => {
  const session = await mongoose.startSession();
  let updatedRequestId;
  let expired = false;
  let confirmError = null;

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

    const now = new Date();
    if (request.expiresAt && now > request.expiresAt) {
      const itemA = await Item.findById(request.itemId).session(session);
      const itemB = request.offeredItemId
        ? await Item.findById(request.offeredItemId).session(session)
        : null;

      await expireApprovedRequestAndRestoreItems({
        request,
        itemA,
        itemB,
        actorId: userId,
        session,
        now,
        source: "APPROVAL_TIMEOUT",
      });

      expired = true;
      updatedRequestId = request._id;
      return;
    }

    if (isOwner && !request.ownerConfirmedAt) {
      request.ownerConfirmedAt = now;
    }
    if (isRequester && !request.requesterConfirmedAt) {
      request.requesterConfirmedAt = now;
    }

    const bothConfirmed = request.ownerConfirmedAt && request.requesterConfirmedAt;
    if (!bothConfirmed) {
      await request.save({ session });
      updatedRequestId = request._id;
      return;
    }

    const itemA = await Item.findById(request.itemId).session(session);
    const itemB = request.offeredItemId
      ? await Item.findById(request.offeredItemId).session(session)
      : null;

    if (!itemA) throw notFound("Item not found", "ITEM_NOT_FOUND");

    if (request.type === "GIFT") {
      try {
        await ensureWeeklyGiftLimit({
          ownerId: request.ownerId,
          receiverId: request.requesterId,
          session,
          now,
        });
      } catch (err) {
        if (err?.code !== "GIFT_LIMIT_WEEKLY") {
          throw err;
        }

        await expireApprovedRequestAndRestoreItems({
          request,
          itemA,
          itemB,
          actorId: userId,
          session,
          now,
          source: "GIFT_LIMIT_ON_CONFIRM",
        });
        expired = true;
        confirmError = err;
        updatedRequestId = request._id;
        return;
      }
    }

    request.status = "COMPLETED";
    request.completedAt = now;
    request.expiresAt = null;
    request.cancellationReason = null;
    request.chatId = null;
    await request.save({ session });

    await deleteChatByRequestId(request._id, session);

    if (itemA.reservedByRequestId?.toString() !== request._id.toString()) {
      throw conflict("Request cannot be completed", "STATS_INCONSISTENT");
    }

    itemA.status = "COMPLETED";
    itemA.reservedByRequestId = null;
    await itemA.save({ session });

    if (itemB) {
      if (itemB.reservedByRequestId?.toString() !== request._id.toString()) {
        throw conflict("Request cannot be completed", "STATS_INCONSISTENT");
      }
      itemB.status = "COMPLETED";
      itemB.reservedByRequestId = null;
      await itemB.save({ session });
    }

    if (request.type === "GIFT") {
      await ItemTransaction.create(
        [
          {
            type: "GIFT",
            requestId: request._id,
            itemId: itemA._id,
            ownerId: request.ownerId,
            receiverId: request.requesterId,
            itemSnapshot: getItemSnapshot(itemA),
            offeredItemSnapshot: { title: "", imageUrl: "" },
            completedAt: now,
          },
        ],
        { session }
      );

      await User.updateOne(
        { _id: request.ownerId },
        { $inc: { "stats.given": 1 } },
        { session }
      );
    } else {
      await ItemTransaction.create(
        [
          {
            type: "EXCHANGE",
            requestId: request._id,
            itemAId: itemA._id,
            ownerAId: request.ownerId,
            itemBId: itemB ? itemB._id : null,
            ownerBId: request.requesterId,
            itemSnapshot: getItemSnapshot(itemA),
            offeredItemSnapshot: itemB
              ? getItemSnapshot(itemB)
              : { title: "", imageUrl: "" },
            completedAt: now,
          },
        ],
        { session }
      );

      await User.updateOne(
        { _id: request.ownerId },
        { $inc: { "stats.exchanged": 1 } },
        { session }
      );
      await User.updateOne(
        { _id: request.requesterId },
        { $inc: { "stats.exchanged": 1 } },
        { session }
      );
    }

    await createNotifications(
      [
        {
          userId: request.ownerId,
          type: "COMPLETED",
          actorId: userId,
          requestId: request._id,
          itemId: request.itemId,
          offeredItemId: request.offeredItemId || null,
        },
        {
          userId: request.requesterId,
          type: "COMPLETED",
          actorId: userId,
          requestId: request._id,
          itemId: request.itemId,
          offeredItemId: request.offeredItemId || null,
        },
      ],
      session
    );

    await createMarketplaceEvents(
      [
        {
          type: "REQUEST_COMPLETED",
          actorId: userId,
          requestId: request._id,
          itemId: request.itemId,
          offeredItemId: request.offeredItemId || null,
          ownerId: request.ownerId,
          requesterId: request.requesterId,
          metadata: {
            type: request.type,
            completedAt: now,
          },
        },
      ],
      session
    );

    updatedRequestId = request._id;
  });

  session.endSession();
  if (confirmError) {
    throw confirmError;
  }
  if (expired) {
    throw conflict("Request expired", "REQUEST_EXPIRED");
  }
  return getRequestWithNames(updatedRequestId);
};

export const cancelRequest = async (requesterId, requestId) => {
  const session = await mongoose.startSession();
  let updatedRequestId;

  await session.withTransaction(async () => {
    const request = await ItemRequest.findById(requestId).session(session);
    if (!request) throw notFound("Request not found", "REQUEST_NOT_FOUND");

    if (request.requesterId.toString() !== requesterId.toString()) {
      throw forbidden("Not allowed", "REQUEST_NOT_PARTICIPANT");
    }

    if (request.status !== "PENDING") {
      throw conflict("Request is not pending", "REQUEST_NOT_PENDING");
    }

    request.status = "CANCELED";
    request.respondedAt = new Date();
    request.expiresAt = null;
    request.cancellationReason = null;
    request.chatId = null;
    await request.save({ session });

    const item = await Item.findById(request.itemId).session(session);
    if (item) {
      const nextCount = Math.max(0, (item.pendingRequestsCount || 0) - 1);
      item.pendingRequestsCount = nextCount;
      await item.save({ session });
    }

    await createNotifications(
      [
        {
          userId: request.ownerId,
          type: "CANCELED",
          actorId: requesterId,
          requestId: request._id,
          itemId: request.itemId,
          offeredItemId: request.offeredItemId || null,
        },
      ],
      session
    );

    updatedRequestId = request._id;
  });

  session.endSession();
  return getRequestWithNames(updatedRequestId);
};

export const deleteRequest = async (requesterId, requestId) => {
  const session = await mongoose.startSession();
  let updatedRequestId;

  await session.withTransaction(async () => {
    const request = await ItemRequest.findById(requestId).session(session);
    if (!request) throw notFound("Request not found", "REQUEST_NOT_FOUND");

    if (request.requesterId.toString() !== requesterId.toString()) {
      throw forbidden("Not allowed", "REQUEST_NOT_PARTICIPANT");
    }

    if (request.status === "PENDING") {
      request.status = "CANCELED";
      request.respondedAt = new Date();
      request.expiresAt = null;
      request.cancellationReason = null;
      request.chatId = null;
      await request.save({ session });

      const item = await Item.findById(request.itemId).session(session);
      if (item) {
        const nextCount = Math.max(0, (item.pendingRequestsCount || 0) - 1);
        item.pendingRequestsCount = nextCount;
        await item.save({ session });
      }

      await createNotifications(
        [
          {
            userId: request.ownerId,
            type: "CANCELED",
            actorId: requesterId,
            requestId: request._id,
            itemId: request.itemId,
            offeredItemId: request.offeredItemId || null,
          },
        ],
        session
      );

      await createMarketplaceEvents(
        [
          {
            type: "REQUEST_CANCELED",
            actorId: requesterId,
            requestId: request._id,
            itemId: request.itemId,
            offeredItemId: request.offeredItemId || null,
            ownerId: request.ownerId,
            requesterId: request.requesterId,
            metadata: {
              source: "DELETE_PENDING",
            },
          },
        ],
        session
      );

      updatedRequestId = request._id;
      return;
    }

    if (request.status !== "APPROVED") {
      throw conflict("Request is not active", "REQUEST_NOT_ACTIVE");
    }

    const now = new Date();
    const itemA = await Item.findById(request.itemId).session(session);
    if (!itemA) {
      throw conflict("Request cannot be canceled", "STATS_INCONSISTENT");
    }
    if (itemA.reservedByRequestId?.toString() !== request._id.toString()) {
      throw conflict("Request cannot be canceled", "STATS_INCONSISTENT");
    }

    const itemB = request.offeredItemId
      ? await Item.findById(request.offeredItemId).session(session)
      : null;
    if (request.offeredItemId && !itemB) {
      throw conflict("Request cannot be canceled", "STATS_INCONSISTENT");
    }
    if (
      itemB &&
      itemB.reservedByRequestId?.toString() !== request._id.toString()
    ) {
      throw conflict("Request cannot be canceled", "STATS_INCONSISTENT");
    }

    request.status = "CANCELED";
    request.respondedAt = now;
    request.expiresAt = null;
    request.cancellationReason = null;
    request.chatId = null;
    await request.save({ session });

    await deleteChatByRequestId(request._id, session);

    itemA.status = "ACTIVE";
    itemA.reservedByRequestId = null;
    itemA.pendingRequestsCount = 0;
    await itemA.save({ session });

    if (itemB) {
      itemB.status = "ACTIVE";
      itemB.reservedByRequestId = null;
      itemB.pendingRequestsCount = 0;
      await itemB.save({ session });
    }

    if (request.type === "GIFT") {
      await User.updateOne(
        { _id: request.ownerId },
        { $inc: { "stats.giving": 1 } },
        { session }
      );
    } else {
      await User.updateOne(
        { _id: request.ownerId },
        { $inc: { "stats.exchanging": 1 } },
        { session }
      );
      await User.updateOne(
        { _id: request.requesterId },
        { $inc: { "stats.exchanging": 1 } },
        { session }
      );
    }

    await createNotifications(
      [
        {
          userId: request.ownerId,
          type: "CANCELED",
          actorId: requesterId,
          requestId: request._id,
          itemId: request.itemId,
          offeredItemId: request.offeredItemId || null,
        },
        {
          userId: request.requesterId,
          type: "CANCELED",
          actorId: requesterId,
          requestId: request._id,
          itemId: request.itemId,
          offeredItemId: request.offeredItemId || null,
        },
      ],
      session
    );

    await createMarketplaceEvents(
      [
        {
          type: "REQUEST_CANCELED",
          actorId: requesterId,
          requestId: request._id,
          itemId: request.itemId,
          offeredItemId: request.offeredItemId || null,
          ownerId: request.ownerId,
          requesterId: request.requesterId,
          metadata: {
            source: "DELETE_APPROVED",
          },
        },
      ],
      session
    );

    updatedRequestId = request._id;
  });

  session.endSession();
  return getRequestWithNames(updatedRequestId);
};

export const hardDeleteRequest = async (userId, requestId) => {
  const request = await ItemRequest.findById(requestId);
  if (!request) throw notFound("Request not found", "REQUEST_NOT_FOUND");

  const isOwner = request.ownerId.toString() === userId.toString();
  const isRequester = request.requesterId.toString() === userId.toString();
  if (!isOwner && !isRequester) {
    throw forbidden("Not allowed", "REQUEST_NOT_PARTICIPANT");
  }

  const isApprovedWithBothConfirmations =
    request.status === "APPROVED" &&
    Boolean(request.ownerConfirmedAt) &&
    Boolean(request.requesterConfirmedAt);

  if (request.status === "PENDING") {
    throw conflict("Request is not inactive", "REQUEST_NOT_INACTIVE");
  }
  if (request.status === "APPROVED" && !isApprovedWithBothConfirmations) {
    throw conflict("Request is not inactive", "REQUEST_NOT_INACTIVE");
  }

  await deleteChatByRequestId(request._id);
  await createMarketplaceEvents([
    {
      type: "REQUEST_CANCELED",
      actorId: userId,
      requestId: request._id,
      itemId: request.itemId,
      offeredItemId: request.offeredItemId || null,
      ownerId: request.ownerId,
      requesterId: request.requesterId,
      metadata: {
        source: "HARD_DELETE",
        previousStatus: request.status,
      },
    },
  ]);
  await ItemRequest.deleteOne({ _id: request._id });
  return { deleted: true, id: request._id.toString() };
};

export const getRequestDetails = async (userId, requestId) => {
  const request = await getRequestWithNames(requestId);
  if (!request) {
    throw notFound("Request not found", "REQUEST_NOT_FOUND");
  }

  const isOwner = request.ownerId?.toString?.() === userId.toString();
  const isRequester = request.requesterId?.toString?.() === userId.toString();
  if (!isOwner && !isRequester) {
    throw forbidden("Not allowed", "REQUEST_NOT_PARTICIPANT");
  }

  return request;
};

const getHistoryFromCompletedRequests = async (userId, role = "all", options = {}) => {
  const baseFilter = { status: "COMPLETED" };
  let requestFilter = baseFilter;

  if (role === "receiver") {
    requestFilter = { ...baseFilter, requesterId: userId, type: "GIFT" };
  } else if (role === "owner") {
    requestFilter = { ...baseFilter, ownerId: userId, type: "GIFT" };
  } else if (role === "participant") {
    requestFilter = {
      ...baseFilter,
      type: "EXCHANGE",
      $or: [{ ownerId: userId }, { requesterId: userId }],
    };
  } else {
    requestFilter = {
      ...baseFilter,
      $or: [{ ownerId: userId }, { requesterId: userId }],
    };
  }

  const pagination = parsePagination(options);
  const sort = buildHistorySort(options.sort);

  let historyQuery = ItemRequest.find(requestFilter)
    .sort(sort)
    .populate(requestPopulate);

  if (pagination.hasPagination) {
    historyQuery = historyQuery.skip(pagination.skip).limit(pagination.limit);
  }

  const [historyRequests, total] = await Promise.all([
    historyQuery.lean(),
    ItemRequest.countDocuments(requestFilter),
  ]);

  const mappedHistory = historyRequests.map((request) => {
    const item = request.itemId && typeof request.itemId === "object" ? request.itemId : null;
    const offeredItem =
      request.offeredItemId && typeof request.offeredItemId === "object"
        ? request.offeredItemId
        : null;

    const itemDetails = request.type === "GIFT" ? normalizeHistoryItemDetails(item) : null;
    const itemADetails =
      request.type === "EXCHANGE" ? normalizeHistoryItemDetails(item) : null;
    const itemBDetails =
      request.type === "EXCHANGE" ? normalizeHistoryItemDetails(offeredItem) : null;

    const itemSnapshot =
      request.itemSnapshot?.title || request.itemSnapshot?.imageUrl
        ? request.itemSnapshot
        : item
          ? getItemSnapshot(item)
          : null;
    const offeredItemSnapshot =
      request.offeredItemSnapshot?.title || request.offeredItemSnapshot?.imageUrl
        ? request.offeredItemSnapshot
        : offeredItem
          ? getItemSnapshot(offeredItem)
          : null;

    const completedAt = request.completedAt || request.updatedAt || request.createdAt;

    return {
      id: request._id?.toString?.() || request._id,
      _id: request._id,
      type: request.type,
      requestId: request._id?.toString?.() || request._id,
      itemId:
        request.type === "GIFT"
          ? item?._id?.toString?.() || request.itemId || null
          : null,
      ownerId:
        request.type === "GIFT"
          ? request.ownerId?._id?.toString?.() || request.ownerId || null
          : null,
      receiverId:
        request.type === "GIFT"
          ? request.requesterId?._id?.toString?.() || request.requesterId || null
          : null,
      itemAId:
        request.type === "EXCHANGE"
          ? item?._id?.toString?.() || request.itemId || null
          : null,
      ownerAId:
        request.type === "EXCHANGE"
          ? request.ownerId?._id?.toString?.() || request.ownerId || null
          : null,
      itemBId:
        request.type === "EXCHANGE"
          ? offeredItem?._id?.toString?.() || request.offeredItemId || null
          : null,
      ownerBId:
        request.type === "EXCHANGE"
          ? request.requesterId?._id?.toString?.() || request.requesterId || null
          : null,
      completedAt,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      itemDetails,
      itemADetails,
      itemBDetails,
      itemSnapshot,
      offeredItemSnapshot,
      thumbnailUrl: itemSnapshot?.imageUrl || "",
      item: request.type === "GIFT" ? itemDetails : itemADetails,
      offeredItem: request.type === "EXCHANGE" ? itemBDetails : null,
    };
  });

  return {
    history: mappedHistory,
    pagination: buildPagination({
      page: pagination.page,
      limit: pagination.limit,
      total,
      hasPagination: pagination.hasPagination,
    }),
  };
};

export const getHistory = async (userId, role = "all", options = {}) => {
  let transactionFilter;

  if (role === "receiver") {
    transactionFilter = { type: "GIFT", receiverId: userId };
  } else if (role === "owner") {
    transactionFilter = { type: "GIFT", ownerId: userId };
  } else if (role === "participant") {
    transactionFilter = {
      type: "EXCHANGE",
      $or: [{ ownerAId: userId }, { ownerBId: userId }],
    };
  } else {
    transactionFilter = {
      $or: [
        { ownerId: userId },
        { receiverId: userId },
        { ownerAId: userId },
        { ownerBId: userId },
      ],
    };
  }

  const pagination = parsePagination(options);
  const sort = buildHistorySort(options.sort);

  let historyQuery = ItemTransaction.find(transactionFilter)
    .sort(sort)
    .populate(historyTransactionPopulate);

  if (pagination.hasPagination) {
    historyQuery = historyQuery.skip(pagination.skip).limit(pagination.limit);
  }

  const [historyTransactions, total] = await Promise.all([
    historyQuery.lean(),
    ItemTransaction.countDocuments(transactionFilter),
  ]);

  if (!total) {
    return getHistoryFromCompletedRequests(userId, role, options);
  }

  const requestIds = Array.from(
    new Set(
      historyTransactions
        .map((tx) => tx?.requestId?.toString?.())
        .filter(Boolean)
    )
  );

  const linkedRequests = requestIds.length
    ? await ItemRequest.find(
        { _id: { $in: requestIds } },
        { _id: 1, itemSnapshot: 1, offeredItemSnapshot: 1 }
      ).lean()
    : [];

  const linkedRequestById = new Map(
    linkedRequests.map((request) => [request._id?.toString?.(), request])
  );

  const mappedHistory = historyTransactions.map((tx) => {
    const requestIdKey = tx.requestId?.toString?.() || "";
    const linkedRequest = linkedRequestById.get(requestIdKey) || null;
    const giftItem =
      tx.itemId && typeof tx.itemId === "object" ? tx.itemId : null;
    const exchangeItemA =
      tx.itemAId && typeof tx.itemAId === "object" ? tx.itemAId : null;
    const exchangeItemB =
      tx.itemBId && typeof tx.itemBId === "object" ? tx.itemBId : null;

    const itemDetails = tx.type === "GIFT" ? normalizeHistoryItemDetails(giftItem) : null;
    const itemADetails =
      tx.type === "EXCHANGE" ? normalizeHistoryItemDetails(exchangeItemA) : null;
    const itemBDetails =
      tx.type === "EXCHANGE" ? normalizeHistoryItemDetails(exchangeItemB) : null;

    const itemSnapshot =
      tx.itemSnapshot?.title || tx.itemSnapshot?.imageUrl
        ? tx.itemSnapshot
        : linkedRequest?.itemSnapshot?.title || linkedRequest?.itemSnapshot?.imageUrl
          ? linkedRequest.itemSnapshot
          : tx.type === "GIFT"
            ? giftItem
              ? getItemSnapshot(giftItem)
              : null
            : exchangeItemA
              ? getItemSnapshot(exchangeItemA)
              : null;
    const offeredItemSnapshot =
      tx.offeredItemSnapshot?.title || tx.offeredItemSnapshot?.imageUrl
        ? tx.offeredItemSnapshot
        : linkedRequest?.offeredItemSnapshot?.title ||
            linkedRequest?.offeredItemSnapshot?.imageUrl
          ? linkedRequest.offeredItemSnapshot
          : exchangeItemB
            ? getItemSnapshot(exchangeItemB)
            : null;

    const completedAt = tx.completedAt || tx.updatedAt || tx.createdAt;

    return {
      id: tx._id?.toString?.() || tx._id,
      _id: tx._id,
      type: tx.type,
      requestId: requestIdKey || null,
      itemId:
        tx.type === "GIFT"
          ? giftItem?._id?.toString?.() || tx.itemId?.toString?.() || tx.itemId || null
          : null,
      ownerId:
        tx.type === "GIFT"
          ? tx.ownerId?.toString?.() || tx.ownerId || null
          : null,
      receiverId:
        tx.type === "GIFT"
          ? tx.receiverId?.toString?.() || tx.receiverId || null
          : null,
      itemAId:
        tx.type === "EXCHANGE"
          ? exchangeItemA?._id?.toString?.() ||
            tx.itemAId?.toString?.() ||
            tx.itemAId ||
            null
          : null,
      ownerAId:
        tx.type === "EXCHANGE"
          ? tx.ownerAId?.toString?.() || tx.ownerAId || null
          : null,
      itemBId:
        tx.type === "EXCHANGE"
          ? exchangeItemB?._id?.toString?.() ||
            tx.itemBId?.toString?.() ||
            tx.itemBId ||
            null
          : null,
      ownerBId:
        tx.type === "EXCHANGE"
          ? tx.ownerBId?.toString?.() || tx.ownerBId || null
          : null,
      completedAt,
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
      itemDetails,
      itemADetails,
      itemBDetails,
      itemSnapshot,
      offeredItemSnapshot,
      thumbnailUrl: itemSnapshot?.imageUrl || "",
      item: tx.type === "GIFT" ? itemDetails : itemADetails,
      offeredItem: tx.type === "EXCHANGE" ? itemBDetails : null,
    };
  });

  return {
    history: mappedHistory,
    pagination: buildPagination({
      page: pagination.page,
      limit: pagination.limit,
      total,
      hasPagination: pagination.hasPagination,
    }),
  };
};
