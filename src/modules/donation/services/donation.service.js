import mongoose from "mongoose";
import Donation from "../models/donation.model.js";
import {
  normalizeTranslationsInput,
  resolveLocalizedText,
  toPlainTranslations,
} from "../../../i18n/content.js";

const DONATION_KEY = "DONATION_SETTINGS";

const sortMethods = (methods = []) =>
  [...methods].sort((a, b) => {
    if ((a.order || 0) !== (b.order || 0)) {
      return (a.order || 0) - (b.order || 0);
    }
    return (a.label || "").localeCompare(b.label || "");
  });

const toPlainId = (value) => value?._id?.toString?.() || value?.toString?.() || "";

const formatMethod = (method, locale = "en") => {
  const labelTranslations = toPlainTranslations(method.labelTranslations);
  return {
    id: toPlainId(method._id),
    label: resolveLocalizedText({
      locale,
      baseValue: method.label || "",
      translations: labelTranslations,
    }),
    labelTranslations,
    accountNumber: method.accountNumber || "",
    link: method.link || "",
    isActive: Boolean(method.isActive),
    order: Number(method.order || 0),
  };
};

const formatConfig = (doc, locale = "en") => ({
  key: doc.key,
  methods: sortMethods(doc.methods || []).map((method) =>
    formatMethod(method, locale)
  ),
  createdBy: toPlainId(doc.createdBy) || null,
  updatedBy: toPlainId(doc.updatedBy) || null,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const ensureDonationConfig = async () => {
  const existing = await Donation.findOne({ key: DONATION_KEY });
  if (existing) return existing;

  try {
    return await Donation.create({ key: DONATION_KEY, methods: [] });
  } catch (error) {
    if (error?.code === 11000) {
      return Donation.findOne({ key: DONATION_KEY });
    }
    throw error;
  }
};

const normalizeMethodInput = (method, index) => {
  const normalizedAccountNumber = method.accountNumber?.trim() || "";
  const normalizedLink = method.link?.trim() || "";
  const hasAccountNumber = normalizedAccountNumber.length > 0;
  const hasLink = normalizedLink.length > 0;

  const normalized = {
    label: method.label.trim(),
    labelTranslations: normalizeTranslationsInput(method.labelTranslations),
    accountNumber: hasAccountNumber ? normalizedAccountNumber : undefined,
    link: hasLink ? normalizedLink : undefined,
    isActive: method.isActive !== undefined ? Boolean(method.isActive) : true,
    order: Number.isInteger(method.order) ? method.order : index,
  };

  if (method.id && mongoose.Types.ObjectId.isValid(method.id)) {
    normalized._id = method.id;
  }

  return normalized;
};

export const getPublicDonations = async (locale = "en") => {
  const config = await ensureDonationConfig();
  const methods = sortMethods(config.methods || [])
    .filter((method) => method.isActive)
    .map((method) => {
      const formatted = formatMethod(method, locale);
      return {
        id: formatted.id,
        label: formatted.label,
        labelTranslations: formatted.labelTranslations,
        accountNumber: formatted.accountNumber,
        link: formatted.link,
        order: formatted.order,
      };
    });

  return {
    methods,
    updatedAt: config.updatedAt,
  };
};

export const getAdminDonations = async (locale = "en") => {
  const config = await ensureDonationConfig();
  return formatConfig(config, locale);
};

export const updateAdminDonations = async ({ userId, payload, locale = "en" }) => {
  const config = await ensureDonationConfig();

  config.methods = (payload.methods || []).map(normalizeMethodInput);
  if (!config.createdBy) {
    config.createdBy = userId;
  }
  config.updatedBy = userId;

  await config.save();
  return formatConfig(config, locale);
};
