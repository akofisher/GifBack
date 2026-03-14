import {
  resolveLocalizedText,
  toPlainTranslations,
} from "../../../i18n/content.js";
import { normalizeLanguage } from "../../../i18n/localization.js";
import {
  ACTIVE_REQUEST_STATUSES,
  REQUEST_BLOCK_REASONS,
} from "./marketplace.constants.js";

export const buildName = (user) =>
  [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();

export const getItemSnapshot = (item) => ({
  title: item?.title || "",
  imageUrl: item?.images?.[0]?.url || "",
});

export const toObjectIdString = (value) => value?.toString?.() || String(value || "");

const resolveLocalizedLocationName = ({ locale, name, nameTranslations, localName }) =>
  resolveLocalizedText({
    locale,
    baseValue: name,
    translations: nameTranslations,
    fallbackValue: normalizeLanguage(locale) === "ka" ? localName : "",
  });

const normalizeCountry = (country, locale = "en") => {
  if (!country) return null;
  const nameTranslations = toPlainTranslations(country.nameTranslations);
  return {
    id: country._id?.toString?.() || "",
    name: resolveLocalizedLocationName({
      locale,
      name: country.name || "",
      nameTranslations,
      localName: country.localName || "",
    }),
    defaultName: country.name || "",
    nameTranslations,
    localName: country.localName || "",
    code: country.code || "",
    isActive: Boolean(country.isActive),
    order: Number(country.order || 0),
    createdAt: country.createdAt || null,
    updatedAt: country.updatedAt || null,
  };
};

const normalizeCity = (city, locale = "en") => {
  if (!city) return null;
  const nameTranslations = toPlainTranslations(city.nameTranslations);
  return {
    id: city._id?.toString?.() || "",
    name: resolveLocalizedLocationName({
      locale,
      name: city.name || "",
      nameTranslations,
      localName: city.localName || "",
    }),
    defaultName: city.name || "",
    nameTranslations,
    localName: city.localName || "",
    isActive: Boolean(city.isActive),
    order: Number(city.order || 0),
  };
};

export const extractItemLocation = (item, locale = "en") => {
  const country =
    item?.countryId && typeof item.countryId === "object" ? item.countryId : null;
  const countryRef = country?._id || item?.countryId || null;
  const cityRef = item?.cityId || null;

  if (!country) {
    return {
      countryId: countryRef,
      cityId: cityRef,
      country: null,
      city: null,
    };
  }

  const city =
    country.cities?.find(
      (entry) => entry?._id?.toString?.() === cityRef?.toString?.()
    ) || null;

  return {
    countryId: country._id?.toString?.() || countryRef,
    cityId: city?._id?.toString?.() || cityRef,
    country: normalizeCountry(country, locale),
    city: normalizeCity(city, locale),
  };
};

export const normalizeLocationCountries = (countries, locale = "en") =>
  countries
    .map((country) => ({
      ...normalizeCountry(country, locale),
      cities: (country.cities || [])
        .filter((city) => city?.isActive)
        .sort((a, b) => {
          if ((a.order || 0) !== (b.order || 0)) {
            return (a.order || 0) - (b.order || 0);
          }
          return (a.name || "").localeCompare(b.name || "");
        })
        .map((city) => normalizeCity(city, locale)),
    }))
    .sort((a, b) => {
      if ((a.order || 0) !== (b.order || 0)) {
        return (a.order || 0) - (b.order || 0);
      }
      return (a.name || "").localeCompare(b.name || "");
    });

export const formatCategory = (category, locale = "en") => {
  const nameTranslations = toPlainTranslations(category.nameTranslations);
  return {
    ...category,
    name: resolveLocalizedText({
      locale,
      baseValue: category.name,
      translations: nameTranslations,
    }),
    nameTranslations,
  };
};

export const isValidDate = (value) =>
  value instanceof Date && !Number.isNaN(value.getTime());

export const formatItemWithOwner = (item) => {
  if (!item) return item;
  const owner =
    item.ownerId && typeof item.ownerId === "object" ? item.ownerId : null;
  const ownerName = owner ? buildName(owner) : "";
  const location = extractItemLocation(item);

  return {
    ...item,
    id: item._id?.toString?.() || item._id,
    ownerId: owner?._id?.toString?.() || item.ownerId,
    countryId: location.countryId,
    cityId: location.cityId,
    country: location.country,
    city: location.city,
    address: item.address || "",
    ownerName,
    thumbnailUrl: item.images?.[0]?.url || "",
    owner: owner
      ? {
          id: owner._id?.toString?.() || "",
          firstName: owner.firstName || "",
          lastName: owner.lastName || "",
          name: ownerName,
        }
      : null,
  };
};

export const normalizeHistoryItemDetails = (item) => {
  if (!item) return null;
  const location = extractItemLocation(item);
  return {
    id: item._id?.toString?.() || item._id,
    title: item.title || "",
    description: item.description || "",
    images: item.images || [],
    mode: item.mode,
    status: item.status,
    categoryId: item.categoryId || null,
    ownerId: item.ownerId || null,
    countryId: location.countryId,
    cityId: location.cityId,
    country: location.country,
    city: location.city,
    address: item.address || "",
  };
};

export const resolveViewerRequestState = ({
  viewerId,
  itemStatus,
  itemOwnerId,
  myRequestStatus,
  blockedByPolicy = false,
}) => {
  if (!viewerId) {
    return {
      canCreateRequest: null,
      requestBlockReason: null,
    };
  }

  const viewerKey = viewerId.toString();
  const ownerKey = itemOwnerId?.toString?.() || (itemOwnerId ? String(itemOwnerId) : "");

  if (itemStatus !== "ACTIVE") {
    return {
      canCreateRequest: false,
      requestBlockReason: REQUEST_BLOCK_REASONS.ITEM_NOT_ACTIVE,
    };
  }

  if (ownerKey && ownerKey === viewerKey) {
    return {
      canCreateRequest: false,
      requestBlockReason: REQUEST_BLOCK_REASONS.OWNER_ITEM,
    };
  }

  if (myRequestStatus && ACTIVE_REQUEST_STATUSES.includes(myRequestStatus)) {
    return {
      canCreateRequest: false,
      requestBlockReason: REQUEST_BLOCK_REASONS.ALREADY_IN_PROCESS,
    };
  }

  if (blockedByPolicy) {
    return {
      canCreateRequest: false,
      requestBlockReason: REQUEST_BLOCK_REASONS.BLOCKED_BY_POLICY,
    };
  }

  return {
    canCreateRequest: true,
    requestBlockReason: null,
  };
};

export const formatRequestWithUsers = (request, options = {}) => {
  if (!request) return request;
  const viewerId = options.viewerId ? toObjectIdString(options.viewerId) : "";
  const owner =
    request.ownerId && typeof request.ownerId === "object"
      ? request.ownerId
      : null;
  const requester =
    request.requesterId && typeof request.requesterId === "object"
      ? request.requesterId
      : null;
  const item =
    request.itemId && typeof request.itemId === "object" ? request.itemId : null;
  const offeredItem =
    request.offeredItemId && typeof request.offeredItemId === "object"
      ? request.offeredItemId
      : null;

  const ownerName = owner ? buildName(owner) : "";
  const requesterName = requester ? buildName(requester) : "";
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
  const itemDetails = item ? normalizeHistoryItemDetails(item) : null;
  const offeredItemDetails = offeredItem
    ? normalizeHistoryItemDetails(offeredItem)
    : null;

  const hasOwnerSeenAt = Object.prototype.hasOwnProperty.call(
    request,
    "ownerSeenAt"
  );
  const hasRequesterSeenAt = Object.prototype.hasOwnProperty.call(
    request,
    "requesterSeenAt"
  );
  const legacySeenFallback = request.updatedAt || request.createdAt || null;
  const ownerSeenAt = hasOwnerSeenAt
    ? request.ownerSeenAt || null
    : legacySeenFallback;
  const requesterSeenAt = hasRequesterSeenAt
    ? request.requesterSeenAt || null
    : legacySeenFallback;
  const ownerId = owner?._id?.toString?.() || toObjectIdString(request.ownerId);
  const requesterId =
    requester?._id?.toString?.() || toObjectIdString(request.requesterId);
  const isSeenByOwner = Boolean(ownerSeenAt);
  const isSeenByRequester = Boolean(requesterSeenAt);
  let viewerSeen = null;
  let viewerUnread = null;

  if (viewerId) {
    if (ownerId && ownerId === viewerId) {
      viewerSeen = isSeenByOwner;
    } else if (requesterId && requesterId === viewerId) {
      viewerSeen = isSeenByRequester;
    }

    if (viewerSeen !== null) {
      viewerUnread = !viewerSeen;
    }
  }

  return {
    ...request,
    id: request._id?.toString?.() || request._id,
    ownerId,
    requesterId,
    itemId: item?._id?.toString?.() || request.itemId,
    offeredItemId: offeredItem?._id?.toString?.() || request.offeredItemId,
    chatId: request.chatId?.toString?.() || request.chatId || null,
    cancellationReason: request.cancellationReason || null,
    ownerSeenAt,
    requesterSeenAt,
    isSeenByOwner,
    isSeenByRequester,
    viewerSeen,
    viewerUnread,
    ownerName,
    requesterName,
    itemSnapshot,
    offeredItemSnapshot,
    itemThumbnailUrl: itemSnapshot?.imageUrl || "",
    offeredItemThumbnailUrl: offeredItemSnapshot?.imageUrl || "",
    itemDetails,
    offeredItemDetails,
    item: itemDetails,
    offeredItem: offeredItemDetails,
    owner: owner
      ? {
          id: owner._id?.toString?.() || "",
          firstName: owner.firstName || "",
          lastName: owner.lastName || "",
          name: ownerName,
        }
      : null,
    requester: requester
      ? {
          id: requester._id?.toString?.() || "",
          firstName: requester.firstName || "",
          lastName: requester.lastName || "",
          name: requesterName,
        }
      : null,
  };
};

export const itemPopulate = [
  { path: "ownerId", select: "firstName lastName" },
  { path: "countryId", select: "name localName code isActive order cities" },
];

export const requestPopulate = [
  { path: "ownerId", select: "firstName lastName" },
  { path: "requesterId", select: "firstName lastName" },
  {
    path: "itemId",
    select: "title description images mode status categoryId ownerId countryId cityId address",
    populate: {
      path: "countryId",
      select: "name localName code isActive order cities",
    },
  },
  {
    path: "offeredItemId",
    select: "title description images mode status categoryId ownerId countryId cityId address",
    populate: {
      path: "countryId",
      select: "name localName code isActive order cities",
    },
  },
];

export const historyTransactionPopulate = [
  {
    path: "itemId",
    select: "title description images mode status categoryId ownerId countryId cityId address",
    populate: {
      path: "countryId",
      select: "name localName code isActive order cities",
    },
  },
  {
    path: "itemAId",
    select: "title description images mode status categoryId ownerId countryId cityId address",
    populate: {
      path: "countryId",
      select: "name localName code isActive order cities",
    },
  },
  {
    path: "itemBId",
    select: "title description images mode status categoryId ownerId countryId cityId address",
    populate: {
      path: "countryId",
      select: "name localName code isActive order cities",
    },
  },
];
