import { notFound } from "../../../utils/appError.js";
import About from "../models/about.model.js";
import {
  normalizeTranslationsInput,
  resolveLocalizedText,
  toPlainTranslations,
} from "../../../i18n/content.js";

const ABOUT_KEY = "ABOUT_US";

const buildName = (firstName, lastName) =>
  [firstName, lastName].filter(Boolean).join(" ").trim();

const basePopulate = [
  { path: "createdBy", select: "firstName lastName" },
  { path: "updatedBy", select: "firstName lastName" },
];

const formatUserRef = (value) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  return {
    id: value._id?.toString?.() || "",
    firstName: value.firstName || "",
    lastName: value.lastName || "",
    name: buildName(value.firstName, value.lastName),
  };
};

const formatSocialLinks = (links = [], locale = "en") =>
  links.map((link) => {
    const labelTranslations = toPlainTranslations(link.labelTranslations);
    return {
      key: link.key,
      label: resolveLocalizedText({
        locale,
        baseValue: link.label || "",
        translations: labelTranslations,
      }),
      labelTranslations,
      url: link.url,
    };
  });

const formatExtraFields = (fields = [], locale = "en") =>
  fields.map((entry) => {
    const keyTranslations = toPlainTranslations(entry.keyTranslations);
    const valueTranslations = toPlainTranslations(entry.valueTranslations);
    return {
      key: resolveLocalizedText({
        locale,
        baseValue: entry.key || "",
        translations: keyTranslations,
      }),
      keyTranslations,
      value: resolveLocalizedText({
        locale,
        baseValue: entry.value || "",
        translations: valueTranslations,
      }),
      valueTranslations,
    };
  });

const formatEntry = (entry, locale = "en") => {
  if (!entry) return null;
  const titleTranslations = toPlainTranslations(entry.titleTranslations);
  const subTitleTranslations = toPlainTranslations(entry.subTitleTranslations);
  const descriptionTranslations = toPlainTranslations(
    entry.descriptionTranslations
  );

  return {
    _id: entry._id,
    key: entry.key,
    title: resolveLocalizedText({
      locale,
      baseValue: entry.title || "",
      translations: titleTranslations,
    }),
    titleTranslations,
    subTitle: resolveLocalizedText({
      locale,
      baseValue: entry.subTitle || "",
      translations: subTitleTranslations,
    }),
    subTitleTranslations,
    description: resolveLocalizedText({
      locale,
      baseValue: entry.description || "",
      translations: descriptionTranslations,
    }),
    descriptionTranslations,
    socialLinks: formatSocialLinks(entry.socialLinks || [], locale),
    extraFields: formatExtraFields(entry.extraFields || [], locale),
    image: entry.image || null,
    createdBy: formatUserRef(entry.createdBy),
    updatedBy: formatUserRef(entry.updatedBy),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
};

const findExistingAbout = async () => {
  const byKey = await About.findOne({ key: ABOUT_KEY }).sort({ updatedAt: -1 });
  if (byKey) return byKey;
  return About.findOne({}).sort({ updatedAt: -1 });
};

const findExistingAboutLean = async () => {
  const byKey = await About.findOne({ key: ABOUT_KEY })
    .sort({ updatedAt: -1 })
    .populate(basePopulate)
    .lean();
  if (byKey) return byKey;
  return About.findOne({})
    .sort({ updatedAt: -1 })
    .populate(basePopulate)
    .lean();
};

const applyPayload = (target, payload, options = {}) => {
  const hasSocialLinks = Boolean(options.hasSocialLinks);

  if (payload.title !== undefined) target.title = payload.title.trim();
  if (payload.titleTranslations !== undefined) {
    target.titleTranslations = normalizeTranslationsInput(payload.titleTranslations);
  }
  if (payload.subTitle !== undefined) target.subTitle = payload.subTitle.trim();
  if (payload.subTitleTranslations !== undefined) {
    target.subTitleTranslations = normalizeTranslationsInput(
      payload.subTitleTranslations
    );
  }
  if (payload.description !== undefined)
    target.description = payload.description.trim();
  if (payload.descriptionTranslations !== undefined) {
    target.descriptionTranslations = normalizeTranslationsInput(
      payload.descriptionTranslations
    );
  }

  if (hasSocialLinks) {
    target.socialLinks = Array.isArray(payload.socialLinks)
      ? payload.socialLinks.map((entry) => ({
          ...entry,
          labelTranslations: normalizeTranslationsInput(entry.labelTranslations),
        }))
      : [];
  } else if (payload.socialLinks !== undefined) {
    target.socialLinks = payload.socialLinks.map((entry) => ({
      ...entry,
      labelTranslations: normalizeTranslationsInput(entry.labelTranslations),
    }));
  }
  if (payload.extraFields !== undefined) {
    target.extraFields = payload.extraFields.map((entry) => ({
      ...entry,
      keyTranslations: normalizeTranslationsInput(entry.keyTranslations),
      valueTranslations: normalizeTranslationsInput(entry.valueTranslations),
    }));
  }
  if (payload.image !== undefined) target.image = payload.image;
};

export const createAboutEntry = async ({ userId, payload, locale = "en" }) => {
  const existing = await findExistingAbout();

  if (existing) {
    applyPayload(existing, payload);
    existing.key = ABOUT_KEY;
    existing.updatedBy = userId;
    if (!existing.createdBy) existing.createdBy = userId;
    await existing.save();

    const updated = await About.findById(existing._id)
      .populate(basePopulate)
      .lean();
    return formatEntry(updated, locale);
  }

  const [created] = await About.create([
    {
      key: ABOUT_KEY,
      title: payload.title.trim(),
      titleTranslations: normalizeTranslationsInput(payload.titleTranslations),
      subTitle: payload.subTitle?.trim() || "",
      subTitleTranslations: normalizeTranslationsInput(payload.subTitleTranslations),
      description: payload.description.trim(),
      descriptionTranslations: normalizeTranslationsInput(payload.descriptionTranslations),
      socialLinks: (payload.socialLinks || []).map((entry) => ({
        ...entry,
        labelTranslations: normalizeTranslationsInput(entry.labelTranslations),
      })),
      extraFields: (payload.extraFields || []).map((entry) => ({
        ...entry,
        keyTranslations: normalizeTranslationsInput(entry.keyTranslations),
        valueTranslations: normalizeTranslationsInput(entry.valueTranslations),
      })),
      image: payload.image || null,
      createdBy: userId,
      updatedBy: userId,
    },
  ]);

  const entry = await About.findById(created._id).populate(basePopulate).lean();
  return formatEntry(entry, locale);
};

export const getAboutEntryForAdmin = async (locale = "en") => {
  const entry = await findExistingAboutLean();
  if (!entry) throw notFound("About data not found", "ABOUT_NOT_FOUND");
  return formatEntry(entry, locale);
};

export const updateAboutEntry = async ({
  userId,
  payload,
  hasSocialLinks = false,
  locale = "en",
}) => {
  const entry = await findExistingAbout();
  if (!entry) throw notFound("About data not found", "ABOUT_NOT_FOUND");

  applyPayload(entry, payload, { hasSocialLinks });
  entry.key = ABOUT_KEY;
  entry.updatedBy = userId;
  if (!entry.createdBy) entry.createdBy = userId;

  await entry.save();
  const updated = await About.findById(entry._id).populate(basePopulate).lean();
  return formatEntry(updated, locale);
};

export const deleteAboutEntry = async () => {
  const entry = await findExistingAbout();
  if (!entry) throw notFound("About data not found", "ABOUT_NOT_FOUND");

  await About.deleteOne({ _id: entry._id });
  return { deleted: true, id: entry._id.toString() };
};

export const getAboutEntry = async (locale = "en") => {
  const entry = await findExistingAboutLean();
  if (!entry) throw notFound("About data not found", "ABOUT_NOT_FOUND");
  return formatEntry(entry, locale);
};
