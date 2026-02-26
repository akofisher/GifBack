import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { conflict, forbidden, notFound } from "../../../utils/appError.js";
import { deleteChatsByRequestIds } from "../../chat/services/chat.service.js";
import Session from "../../auth/models/session.model.js";
import User from "../../user/models/user.model.js";
import { normalizeLanguage } from "../../../i18n/localization.js";
import {
  normalizeTranslationsInput,
  resolveLocalizedText,
  toPlainTranslations,
} from "../../../i18n/content.js";
import Category from "../../marketplace/models/category.model.js";
import Location from "../../marketplace/models/location.model.js";
import Item from "../../marketplace/models/item.model.js";
import ItemRequest from "../../marketplace/models/request.model.js";
import Notification from "../../marketplace/models/notification.model.js";
import ProductReport from "../../reports/models/product-report.model.js";
import { createMarketplaceEvents } from "../../marketplace/services/event-log.service.js";
import {
  canManageTargetRole,
  getRolePermissions,
  isSuperAdminRole,
  normalizeRole,
  ROLE,
} from "../rbac/rbac.js";

const buildSort = (sort) => {
  if (sort === "createdAt_asc") return { createdAt: 1, _id: 1 };
  if (sort === "updatedAt_desc") return { updatedAt: -1, _id: -1 };
  if (sort === "updatedAt_asc") return { updatedAt: 1, _id: 1 };
  return { createdAt: -1, _id: -1 };
};

const buildPagination = ({ page = 1, limit = 20, total = 0 }) => ({
  page,
  limit,
  total,
  pages: Math.max(1, Math.ceil(total / limit)),
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

const emptyPaginatedResult = ({ page = 1, limit = 20, key = "items" }) => ({
  [key]: [],
  pagination: buildPagination({ page, limit, total: 0 }),
});

const buildName = (firstName, lastName) =>
  [firstName, lastName].filter(Boolean).join(" ").trim();

const buildItemSnapshot = (item) => ({
  title: item?.title || "",
  imageUrl: item?.images?.[0]?.url || "",
});

const normalizeCountry = (country) => {
  if (!country) return null;
  return {
    id: country._id?.toString?.() || "",
    name: country.name || "",
    nameTranslations: toPlainTranslations(country.nameTranslations),
    localName: country.localName || "",
    code: country.code || "",
    isActive: Boolean(country.isActive),
    order: Number(country.order || 0),
  };
};

const normalizeCity = (city) => {
  if (!city) return null;
  return {
    id: city._id?.toString?.() || "",
    name: city.name || "",
    nameTranslations: toPlainTranslations(city.nameTranslations),
    localName: city.localName || "",
    isActive: Boolean(city.isActive),
    order: Number(city.order || 0),
  };
};

const sortCityRows = (rows) =>
  [...rows].sort((a, b) => {
    if ((a.order || 0) !== (b.order || 0)) {
      return (a.order || 0) - (b.order || 0);
    }
    return (a.name || "").localeCompare(b.name || "");
  });

const formatCountryWithCities = (country) => ({
  ...normalizeCountry(country),
  cities: sortCityRows(country.cities || []).map(normalizeCity),
});

const resolveLocalizedLocationName = ({ locale, name, nameTranslations, localName }) =>
  resolveLocalizedText({
    locale,
    baseValue: name,
    translations: nameTranslations,
    fallbackValue: normalizeLanguage(locale) === "ka" ? localName : "",
  });

const formatCategory = (category, locale = "en") => {
  const translations = toPlainTranslations(category.nameTranslations);
  return {
    ...category,
    name: resolveLocalizedText({
      locale,
      baseValue: category.name,
      translations,
    }),
    nameTranslations: translations,
  };
};

const formatLocationCountry = (country, locale = "en") => {
  const base = formatCountryWithCities(country);
  return {
    ...base,
    name: resolveLocalizedLocationName({
      locale,
      name: base.name,
      nameTranslations: base.nameTranslations,
      localName: base.localName,
    }),
    cities: (base.cities || []).map((city) => ({
      ...city,
      name: resolveLocalizedLocationName({
        locale,
        name: city.name,
        nameTranslations: city.nameTranslations,
        localName: city.localName,
      }),
    })),
  };
};

const extractItemLocation = (item) => {
  const country =
    item?.countryId && typeof item.countryId === "object" ? item.countryId : null;
  const countryId = country?._id?.toString?.() || item?.countryId || null;
  const cityId = item?.cityId || null;

  if (!country) {
    return {
      countryId,
      cityId,
      country: null,
      city: null,
    };
  }

  const city =
    country.cities?.find(
      (entry) => entry?._id?.toString?.() === cityId?.toString?.()
    ) || null;

  return {
    countryId,
    cityId: city?._id?.toString?.() || cityId,
    country: normalizeCountry(country),
    city: normalizeCity(city),
  };
};

const formatAdminItem = (item) => {
  if (!item) return null;
  const owner =
    item.ownerId && typeof item.ownerId === "object" ? item.ownerId : null;
  const category =
    item.categoryId && typeof item.categoryId === "object" ? item.categoryId : null;
  const location = extractItemLocation(item);
  const ownerName = owner ? buildName(owner.firstName, owner.lastName) : "";

  return {
    ...item,
    ownerId: owner?._id?.toString?.() || item.ownerId,
    categoryId: category?._id?.toString?.() || item.categoryId,
    countryId: location.countryId,
    cityId: location.cityId,
    country: location.country,
    city: location.city,
    address: item.address || "",
    ownerName,
    categoryName: category?.name || "",
    owner: owner
      ? {
          id: owner._id?.toString?.() || "",
          firstName: owner.firstName || "",
          lastName: owner.lastName || "",
          name: ownerName,
          email: owner.email || "",
          isActive: owner.isActive,
        }
      : null,
    category: category
      ? {
          id: category._id?.toString?.() || "",
          name: category.name || "",
          isActive: category.isActive,
          order: category.order,
        }
      : null,
  };
};

const toSafeUser = (user) => ({
  _id: user._id?.toString?.() || user._id,
  firstName: user.firstName || "",
  lastName: user.lastName || "",
  name: buildName(user.firstName, user.lastName),
  email: user.email || "",
  emailVerified: Boolean(user.emailVerified),
  phone: user.phone || "",
  role: normalizeRole(user.role),
  permissions: getRolePermissions(user.role),
  isActive: Boolean(user.isActive),
  avatar: user.avatar || null,
  stats: user.stats || {},
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const createNotifications = async (entries, session) => {
  if (!entries.length) return;
  await Notification.insertMany(entries, { session });
};

const adjustActiveListingStat = async ({ ownerId, mode, delta, session }) => {
  if (!ownerId || !mode || !delta) return;
  const field = mode === "GIFT" ? "stats.giving" : "stats.exchanging";
  await User.updateOne({ _id: ownerId }, { $inc: { [field]: delta } }, { session });
};

const cleanupRequestsForDeletedItem = async ({ item, actorId, session }) => {
  const now = new Date();
  const snapshot = buildItemSnapshot(item);
  const itemId = item._id.toString();

  const activeRequests = await ItemRequest.find({
    status: { $in: ["PENDING", "APPROVED"] },
    $or: [{ itemId: item._id }, { offeredItemId: item._id }],
  })
    .select("_id status type ownerId requesterId itemId offeredItemId")
    .session(session);

  if (!activeRequests.length) return;

  const bulkOps = [];
  const approvedRequestIds = [];
  const pendingCountByTargetItem = new Map();
  const counterpartReservations = [];
  const notifications = [];
  const events = [];

  for (const request of activeRequests) {
    const isTargetItem = request.itemId?.toString() === itemId;
    const wasApproved = request.status === "APPROVED";
    const nextStatus = wasApproved ? "EXPIRED" : "CANCELED";

    const updateSet = {
      status: nextStatus,
      respondedAt: now,
      expiresAt: null,
      chatId: null,
    };

    if (isTargetItem) {
      updateSet.itemSnapshot = snapshot;
    } else {
      updateSet.offeredItemSnapshot = snapshot;
      if (!wasApproved && request.itemId) {
        const key = request.itemId.toString();
        pendingCountByTargetItem.set(key, (pendingCountByTargetItem.get(key) || 0) + 1);
      }
    }

    bulkOps.push({
      updateOne: {
        filter: { _id: request._id },
        update: { $set: updateSet },
      },
    });

    if (wasApproved) {
      approvedRequestIds.push(request._id);
      const counterpartItemId = isTargetItem ? request.offeredItemId : request.itemId;
      if (counterpartItemId && counterpartItemId.toString() !== itemId) {
        counterpartReservations.push({
          requestId: request._id,
          counterpartItemId,
        });
      }
    }

    notifications.push(
      {
        userId: request.ownerId,
        type: nextStatus,
        actorId,
        requestId: request._id,
        itemId: request.itemId,
        offeredItemId: request.offeredItemId || null,
      },
      {
        userId: request.requesterId,
        type: nextStatus,
        actorId,
        requestId: request._id,
        itemId: request.itemId,
        offeredItemId: request.offeredItemId || null,
      }
    );

    events.push({
      type: nextStatus === "EXPIRED" ? "REQUEST_EXPIRED" : "REQUEST_CANCELED",
      actorId,
      requestId: request._id,
      itemId: request.itemId || null,
      offeredItemId: request.offeredItemId || null,
      ownerId: request.ownerId,
      requesterId: request.requesterId,
      metadata: {
        source: "ADMIN_ITEM_DELETE",
      },
    });
  }

  await ItemRequest.bulkWrite(bulkOps, { session });

  if (approvedRequestIds.length) {
    await deleteChatsByRequestIds(approvedRequestIds, session);
  }

  for (const [targetItemId, count] of pendingCountByTargetItem.entries()) {
    const targetItem = await Item.findById(targetItemId).session(session);
    if (!targetItem) continue;
    targetItem.pendingRequestsCount = Math.max(
      0,
      (targetItem.pendingRequestsCount || 0) - count
    );
    await targetItem.save({ session });
  }

  for (const reservation of counterpartReservations) {
    const counterpart = await Item.findById(reservation.counterpartItemId).session(session);
    if (!counterpart) continue;
    if (
      counterpart.reservedByRequestId?.toString() !== reservation.requestId.toString()
    ) {
      continue;
    }

    counterpart.status = "ACTIVE";
    counterpart.reservedByRequestId = null;
    counterpart.pendingRequestsCount = 0;
    await counterpart.save({ session });

    await adjustActiveListingStat({
      ownerId: counterpart.ownerId,
      mode: counterpart.mode,
      delta: 1,
      session,
    });
  }

  await createNotifications(notifications, session);
  await createMarketplaceEvents(events, session);
};

const findAdminItemById = async (itemId, session = null) => {
  let query = Item.findById(itemId).populate([
    { path: "ownerId", select: "firstName lastName email isActive" },
    { path: "categoryId", select: "name isActive order" },
    { path: "countryId", select: "name localName code isActive order cities" },
  ]);
  if (session) query = query.session(session);
  return query.lean();
};

export const getAdminStats = async () => {
  const [
    usersTotal,
    usersActive,
    appUsersTotal,
    appUsersActive,
    staffTotal,
    staffActive,
    adminTotal,
    superAdminTotal,
    productsTotal,
    reportsTotal,
    reportsOpen,
    reportsReviewing,
    reportsResolved,
    reportsRejected,
    productsActive,
    productsReserved,
    productsCompleted,
    productsRemoved,
    productsGift,
    productsExchange,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isActive: true }),
    User.countDocuments({ role: "user" }),
    User.countDocuments({ role: "user", isActive: true }),
    User.countDocuments({ role: { $in: ["admin", "super_admin"] } }),
    User.countDocuments({ role: { $in: ["admin", "super_admin"] }, isActive: true }),
    User.countDocuments({ role: "admin" }),
    User.countDocuments({ role: "super_admin" }),
    Item.countDocuments(),
    ProductReport.countDocuments(),
    ProductReport.countDocuments({ status: "OPEN" }),
    ProductReport.countDocuments({ status: "REVIEWING" }),
    ProductReport.countDocuments({ status: "RESOLVED" }),
    ProductReport.countDocuments({ status: "REJECTED" }),
    Item.countDocuments({ status: "ACTIVE" }),
    Item.countDocuments({ status: "RESERVED" }),
    Item.countDocuments({ status: "COMPLETED" }),
    Item.countDocuments({ status: "REMOVED" }),
    Item.countDocuments({ mode: "GIFT" }),
    Item.countDocuments({ mode: "EXCHANGE" }),
  ]);

  return {
    users: {
      total: usersTotal,
      active: usersActive,
      blocked: usersTotal - usersActive,
      app: {
        total: appUsersTotal,
        active: appUsersActive,
        blocked: appUsersTotal - appUsersActive,
      },
      staff: {
        total: staffTotal,
        active: staffActive,
        blocked: staffTotal - staffActive,
        admins: adminTotal,
        superAdmins: superAdminTotal,
      },
    },
    products: {
      total: productsTotal,
      byStatus: {
        ACTIVE: productsActive,
        RESERVED: productsReserved,
        COMPLETED: productsCompleted,
        REMOVED: productsRemoved,
      },
      byMode: {
        GIFT: productsGift,
        EXCHANGE: productsExchange,
      },
    },
    reports: {
      total: reportsTotal,
      byStatus: {
        OPEN: reportsOpen,
        REVIEWING: reportsReviewing,
        RESOLVED: reportsResolved,
        REJECTED: reportsRejected,
      },
    },
  };
};

export const listAdminUsers = async (query, actorRole = ROLE.ADMIN) => {
  const filter = {};
  const normalizedActorRole = normalizeRole(actorRole);

  if (query.role) {
    filter.role = query.role;
  }

  if (!isSuperAdminRole(normalizedActorRole)) {
    if (query.role && query.role !== ROLE.USER) {
      return {
        users: [],
        pagination: buildPagination({
          page: query.page ?? 1,
          limit: query.limit ?? 20,
          total: 0,
        }),
      };
    }
    filter.role = ROLE.USER;
  }

  if (typeof query.isActive === "boolean") filter.isActive = query.isActive;
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    filter.$or = [
      { firstName: regex },
      { lastName: regex },
      { email: regex },
      { phone: regex },
    ];
  }

  const sort = buildSort(query.sort);
  const usePagination =
    Number.isInteger(query.page) && Number.isInteger(query.limit);
  const page = usePagination ? query.page : 1;
  const limit = usePagination ? query.limit : 0;
  const skip = usePagination ? (page - 1) * limit : 0;

  const [rows, total] = await Promise.all([
    User.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .select("-password")
      .lean(),
    User.countDocuments(filter),
  ]);

  return {
    users: rows.map(toSafeUser),
    pagination: buildPagination({
      page,
      limit: usePagination ? limit : Math.max(total, 1),
      total,
    }),
  };
};

export const listAdminStaff = async (query) => {
  const filter = {
    role: { $in: [ROLE.ADMIN, ROLE.SUPER_ADMIN] },
  };

  if (query.role) {
    filter.role = query.role;
  }
  if (typeof query.isActive === "boolean") {
    filter.isActive = query.isActive;
  }
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    filter.$or = [
      { firstName: regex },
      { lastName: regex },
      { email: regex },
      { phone: regex },
    ];
  }

  const sort = buildSort(query.sort);
  const usePagination =
    Number.isInteger(query.page) && Number.isInteger(query.limit);
  const page = usePagination ? query.page : 1;
  const limit = usePagination ? query.limit : 0;
  const skip = usePagination ? (page - 1) * limit : 0;

  const [rows, total] = await Promise.all([
    User.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .select("-password")
      .lean(),
    User.countDocuments(filter),
  ]);

  return {
    users: rows.map(toSafeUser),
    pagination: buildPagination({
      page,
      limit: usePagination ? limit : Math.max(total, 1),
      total,
    }),
  };
};

export const registerAdminStaff = async ({
  firstName,
  lastName,
  email,
  phone,
  preferredLanguage,
  password,
}) => {
  const normalizedEmail = email.toLowerCase().trim();
  const normalizedPhone = typeof phone === "string" ? phone.trim() : "";

  const conflicts = [];
  if (await User.exists({ email: normalizedEmail })) {
    conflicts.push({ field: "email", message: "Email already in use" });
  }
  if (normalizedPhone && (await User.exists({ phone: normalizedPhone }))) {
    conflicts.push({ field: "phone", message: "Phone already in use" });
  }
  if (conflicts.length) {
    const message =
      conflicts.length === 1
        ? conflicts[0].message
        : "Email and phone already in use";
    throw conflict(message, "DUPLICATE_CREDENTIALS", conflicts);
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await User.create({
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: normalizedEmail,
    phone: normalizedPhone || undefined,
    preferredLanguage: normalizeLanguage(preferredLanguage || "en"),
    password: hashedPassword,
    role: ROLE.ADMIN,
    isActive: true,
    emailVerified: true,
  });

  const safeUser = await User.findById(user._id).select("-password").lean();
  return toSafeUser(safeUser);
};

export const setUserBlockedState = async ({
  adminId,
  actorRole,
  targetUserId,
  isActive,
}) => {
  if (adminId.toString() === targetUserId.toString()) {
    throw forbidden("You cannot change your own admin status", "ADMIN_SELF_ACTION_FORBIDDEN");
  }

  const normalizedActorRole = normalizeRole(actorRole);
  const user = await User.findById(targetUserId).select("role isActive");
  if (!user) throw notFound("User not found", "USER_NOT_FOUND");

  if (
    !canManageTargetRole({
      actorRole: normalizedActorRole,
      targetRole: user.role,
    })
  ) {
    throw forbidden(
      "You are not allowed to manage this user",
      "ADMIN_ACTION_TARGET_FORBIDDEN"
    );
  }

  user.isActive = isActive;
  await user.save();

  if (!isActive) {
    await Session.updateMany(
      { userId: user._id, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
  }

  const fresh = await User.findById(user._id).select("-password").lean();
  return toSafeUser(fresh);
};

export const deleteUserByAdmin = async ({ adminId, targetUserId }) => {
  if (adminId.toString() === targetUserId.toString()) {
    throw forbidden("You cannot delete your own admin account", "ADMIN_SELF_ACTION_FORBIDDEN");
  }

  const actor = await User.findById(adminId).select("role");
  if (!actor) throw notFound("User not found", "USER_NOT_FOUND");

  const user = await User.findById(targetUserId).select("_id role");
  if (!user) throw notFound("User not found", "USER_NOT_FOUND");

  if (
    !canManageTargetRole({
      actorRole: actor.role,
      targetRole: user.role,
    })
  ) {
    throw forbidden(
      "You are not allowed to manage this user",
      "ADMIN_ACTION_TARGET_FORBIDDEN"
    );
  }

  const [activeItems, activeRequests] = await Promise.all([
    Item.countDocuments({
      ownerId: targetUserId,
      status: { $in: ["ACTIVE", "RESERVED"] },
    }),
    ItemRequest.countDocuments({
      status: { $in: ["PENDING", "APPROVED"] },
      $or: [{ ownerId: targetUserId }, { requesterId: targetUserId }],
    }),
  ]);

  if (activeItems > 0 || activeRequests > 0) {
    throw conflict("User has active marketplace data", "USER_DELETE_HAS_ACTIVE_DATA", [
      { field: "activeItems", message: String(activeItems) },
      { field: "activeRequests", message: String(activeRequests) },
    ]);
  }

  await Promise.all([
    Session.deleteMany({ userId: user._id }),
    ProductReport.deleteMany({ reporterId: user._id }),
    Notification.deleteMany({ userId: user._id }),
    User.deleteOne({ _id: user._id }),
  ]);

  return { deleted: true, id: user._id.toString() };
};

export const listAdminCategories = async ({ locale = "en" } = {}) => {
  const categories = await Category.find().sort({ order: 1, name: 1 }).lean();
  return categories.map((category) => formatCategory(category, locale));
};

export const createAdminCategory = async (payload, { locale = "en" } = {}) => {
  const nameTranslations = normalizeTranslationsInput(payload.nameTranslations);
  const [created] = await Category.create([
    {
      name: payload.name.trim(),
      nameTranslations,
      order: payload.order ?? 0,
      isActive: payload.isActive ?? true,
    },
  ]);
  return formatCategory(created.toObject(), locale);
};

export const updateAdminCategory = async (
  categoryId,
  payload,
  { locale = "en" } = {}
) => {
  const category = await Category.findById(categoryId);
  if (!category) throw notFound("Category not found", "CATEGORY_NOT_FOUND");

  if (payload.name !== undefined) category.name = payload.name.trim();
  if (payload.nameTranslations !== undefined) {
    category.nameTranslations = normalizeTranslationsInput(payload.nameTranslations);
  }
  if (payload.order !== undefined) category.order = payload.order;
  if (payload.isActive !== undefined) category.isActive = payload.isActive;

  await category.save();
  return formatCategory(category.toObject(), locale);
};

export const deleteAdminCategory = async (categoryId) => {
  const category = await Category.findById(categoryId);
  if (!category) throw notFound("Category not found", "CATEGORY_NOT_FOUND");

  const linkedItems = await Item.countDocuments({ categoryId: category._id });
  if (linkedItems > 0) {
    throw conflict("Category is used by items", "CATEGORY_IN_USE", [
      { field: "items", message: String(linkedItems) },
    ]);
  }

  await Category.deleteOne({ _id: category._id });
  return { deleted: true, id: category._id.toString() };
};

export const listAdminLocations = async ({ locale = "en" } = {}) => {
  const countries = await Location.find().sort({ order: 1, name: 1 }).lean();
  return countries.map((country) => formatLocationCountry(country, locale));
};

export const createAdminLocationCountry = async (
  payload,
  { locale = "en" } = {}
) => {
  const nameTranslations = normalizeTranslationsInput(payload.nameTranslations);
  const [created] = await Location.create([
    {
      name: payload.name.trim(),
      nameTranslations,
      localName: payload.localName?.trim() || "",
      code: payload.code.trim().toUpperCase(),
      order: payload.order ?? 0,
      isActive: payload.isActive ?? true,
      cities: [],
    },
  ]);

  return formatLocationCountry(created.toObject(), locale);
};

export const updateAdminLocationCountry = async (
  countryId,
  payload,
  { locale = "en" } = {}
) => {
  const country = await Location.findById(countryId);
  if (!country) throw notFound("Country not found", "LOCATION_COUNTRY_NOT_FOUND");

  if (payload.name !== undefined) country.name = payload.name.trim();
  if (payload.nameTranslations !== undefined) {
    country.nameTranslations = normalizeTranslationsInput(payload.nameTranslations);
  }
  if (payload.localName !== undefined) country.localName = payload.localName.trim();
  if (payload.code !== undefined) country.code = payload.code.trim().toUpperCase();
  if (payload.order !== undefined) country.order = payload.order;
  if (payload.isActive !== undefined) country.isActive = payload.isActive;

  await country.save();
  return formatLocationCountry(country.toObject(), locale);
};

export const deleteAdminLocationCountry = async (countryId) => {
  const country = await Location.findById(countryId);
  if (!country) throw notFound("Country not found", "LOCATION_COUNTRY_NOT_FOUND");

  const linkedItems = await Item.countDocuments({ countryId: country._id });
  if (linkedItems > 0) {
    throw conflict("Location is used by items", "LOCATION_IN_USE", [
      { field: "items", message: String(linkedItems) },
    ]);
  }

  await Location.deleteOne({ _id: country._id });
  return { deleted: true, id: country._id.toString() };
};

export const createAdminLocationCity = async (
  countryId,
  payload,
  { locale = "en" } = {}
) => {
  const country = await Location.findById(countryId);
  if (!country) throw notFound("Country not found", "LOCATION_COUNTRY_NOT_FOUND");

  const duplicate = country.cities.some(
    (city) => city.name.toLowerCase() === payload.name.trim().toLowerCase()
  );
  if (duplicate) {
    throw conflict("City already exists in country", "LOCATION_CITY_ALREADY_EXISTS");
  }

  country.cities.push({
    name: payload.name.trim(),
    nameTranslations: normalizeTranslationsInput(payload.nameTranslations),
    localName: payload.localName?.trim() || "",
    order: payload.order ?? 0,
    isActive: payload.isActive ?? true,
  });

  await country.save();
  return formatLocationCountry(country.toObject(), locale);
};

export const updateAdminLocationCity = async (
  countryId,
  cityId,
  payload,
  { locale = "en" } = {}
) => {
  const country = await Location.findById(countryId);
  if (!country) throw notFound("Country not found", "LOCATION_COUNTRY_NOT_FOUND");

  const city = country.cities.id(cityId);
  if (!city) throw notFound("City not found", "LOCATION_CITY_NOT_FOUND");

  if (payload.name !== undefined) {
    const nextName = payload.name.trim().toLowerCase();
    const duplicate = country.cities.some(
      (entry) =>
        entry._id.toString() !== cityId.toString() &&
        entry.name.toLowerCase() === nextName
    );
    if (duplicate) {
      throw conflict("City already exists in country", "LOCATION_CITY_ALREADY_EXISTS");
    }
    city.name = payload.name.trim();
  }

  if (payload.localName !== undefined) city.localName = payload.localName.trim();
  if (payload.nameTranslations !== undefined) {
    city.nameTranslations = normalizeTranslationsInput(payload.nameTranslations);
  }
  if (payload.order !== undefined) city.order = payload.order;
  if (payload.isActive !== undefined) city.isActive = payload.isActive;

  await country.save();
  return formatLocationCountry(country.toObject(), locale);
};

export const deleteAdminLocationCity = async (
  countryId,
  cityId,
  { locale = "en" } = {}
) => {
  const country = await Location.findById(countryId);
  if (!country) throw notFound("Country not found", "LOCATION_COUNTRY_NOT_FOUND");

  const city = country.cities.id(cityId);
  if (!city) throw notFound("City not found", "LOCATION_CITY_NOT_FOUND");

  const linkedItems = await Item.countDocuments({ countryId, cityId });
  if (linkedItems > 0) {
    throw conflict("Location is used by items", "LOCATION_IN_USE", [
      { field: "items", message: String(linkedItems) },
    ]);
  }

  country.cities.pull({ _id: cityId });
  await country.save();
  return formatLocationCountry(country.toObject(), locale);
};

export const listAdminItems = async (query) => {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;

  if (query.itemId && !mongoose.Types.ObjectId.isValid(query.itemId)) {
    return emptyPaginatedResult({ page, limit, key: "items" });
  }
  if (query.ownerId && !mongoose.Types.ObjectId.isValid(query.ownerId)) {
    return emptyPaginatedResult({ page, limit, key: "items" });
  }
  if (query.categoryId && !mongoose.Types.ObjectId.isValid(query.categoryId)) {
    return emptyPaginatedResult({ page, limit, key: "items" });
  }

  const filter = {};
  if (query.itemId) filter._id = query.itemId;
  if (query.status) filter.status = query.status;
  if (query.mode) filter.mode = query.mode;
  if (query.ownerId) filter.ownerId = query.ownerId;
  if (query.categoryId) filter.categoryId = query.categoryId;
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    filter.$or = [{ title: regex }, { description: regex }];
  }

  const skip = (page - 1) * limit;
  const sort = buildSort(query.sort);

  const [items, total] = await Promise.all([
    Item.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate([
        { path: "ownerId", select: "firstName lastName email isActive" },
        { path: "categoryId", select: "name isActive order" },
        { path: "countryId", select: "name localName code isActive order cities" },
      ])
      .lean(),
    Item.countDocuments(filter),
  ]);

  return {
    items: items.map(formatAdminItem),
    pagination: buildPagination({ page, limit, total }),
  };
};

export const getAdminItemById = async (itemId) => {
  const item = await findAdminItemById(itemId);
  if (!item) throw notFound("Item not found", "ITEM_NOT_FOUND");
  return formatAdminItem(item);
};

export const updateAdminItem = async (itemId, payload) => {
  const item = await Item.findById(itemId);
  if (!item) throw notFound("Item not found", "ITEM_NOT_FOUND");

  if (payload.categoryId) {
    const category = await Category.findById(payload.categoryId).select("_id").lean();
    if (!category) throw notFound("Category not found", "CATEGORY_NOT_FOUND");
    item.categoryId = payload.categoryId;
  }

  if (payload.countryId !== undefined || payload.cityId !== undefined) {
    const country = await Location.findById(payload.countryId).lean();
    if (!country) {
      throw notFound("Country not found", "LOCATION_COUNTRY_NOT_FOUND");
    }
    const city = country.cities?.find(
      (entry) => entry?._id?.toString?.() === payload.cityId?.toString?.()
    );
    if (!city) {
      throw conflict(
        "City does not belong to selected country",
        "LOCATION_CITY_COUNTRY_MISMATCH"
      );
    }

    item.countryId = payload.countryId;
    item.cityId = payload.cityId;
  }
  if (payload.title !== undefined) item.title = payload.title.trim();
  if (payload.description !== undefined) item.description = payload.description.trim();
  if (payload.images !== undefined) item.images = payload.images;
  if (payload.address !== undefined) item.address = payload.address.trim();

  await item.save();
  return getAdminItemById(item._id);
};

export const deleteAdminItem = async ({ itemId, actorId }) => {
  const session = await mongoose.startSession();
  let deleted;

  await session.withTransaction(async () => {
    const item = await Item.findById(itemId).session(session);
    if (!item) throw notFound("Item not found", "ITEM_NOT_FOUND");

    const deletedView = await findAdminItemById(item._id, session);
    deleted = formatAdminItem(deletedView);

    await cleanupRequestsForDeletedItem({ item, actorId, session });

    if (item.status === "ACTIVE") {
      await adjustActiveListingStat({
        ownerId: item.ownerId,
        mode: item.mode,
        delta: -1,
        session,
      });
    }

    await createMarketplaceEvents(
      [
        {
          type: "ITEM_DELETED",
          actorId,
          itemId: item._id,
          ownerId: item.ownerId,
          metadata: {
            source: "ADMIN",
            mode: item.mode,
            status: item.status,
          },
        },
      ],
      session
    );

    await Item.deleteOne({ _id: item._id }, { session });
  });

  session.endSession();
  return deleted || { _id: itemId };
};
