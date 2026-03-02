import { normalizeLanguage } from "../../../i18n/localization.js";
import {
  resolveLocalizedText,
  toPlainTranslations,
} from "../../../i18n/content.js";
import { getRolePermissions, normalizeRole } from "../rbac/rbac.js";

export const buildSort = (sort) => {
  if (sort === "createdAt_asc") return { createdAt: 1, _id: 1 };
  if (sort === "updatedAt_desc") return { updatedAt: -1, _id: -1 };
  if (sort === "updatedAt_asc") return { updatedAt: 1, _id: 1 };
  return { createdAt: -1, _id: -1 };
};

export const buildPagination = ({ page = 1, limit = 20, total = 0 }) => ({
  page,
  limit,
  total,
  pages: Math.max(1, Math.ceil(total / limit)),
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

export const emptyPaginatedResult = ({
  page = 1,
  limit = 20,
  key = "items",
}) => ({
  [key]: [],
  pagination: buildPagination({ page, limit, total: 0 }),
});

export const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const buildName = (firstName, lastName) =>
  [firstName, lastName].filter(Boolean).join(" ").trim();

export const buildItemSnapshot = (item) => ({
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

const resolveLocalizedLocationName = ({
  locale,
  name,
  nameTranslations,
  localName,
}) =>
  resolveLocalizedText({
    locale,
    baseValue: name,
    translations: nameTranslations,
    fallbackValue: normalizeLanguage(locale) === "ka" ? localName : "",
  });

export const formatCategory = (category, locale = "en") => {
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

export const formatLocationCountry = (country, locale = "en") => {
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

export const formatAdminItem = (item) => {
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

export const toSafeUser = (user) => ({
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
