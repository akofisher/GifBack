import { notFound } from "../../../utils/appError.js";
import About from "../models/about.model.js";

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

const formatEntry = (entry) => {
  if (!entry) return null;
  return {
    _id: entry._id,
    key: entry.key,
    title: entry.title,
    subTitle: entry.subTitle,
    description: entry.description,
    socialLinks: entry.socialLinks || [],
    extraFields: entry.extraFields || [],
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
  if (payload.subTitle !== undefined) target.subTitle = payload.subTitle.trim();
  if (payload.description !== undefined)
    target.description = payload.description.trim();

  if (hasSocialLinks) {
    target.socialLinks = Array.isArray(payload.socialLinks)
      ? payload.socialLinks
      : [];
  } else if (payload.socialLinks !== undefined) {
    target.socialLinks = payload.socialLinks;
  }
  if (payload.extraFields !== undefined) target.extraFields = payload.extraFields;
  if (payload.image !== undefined) target.image = payload.image;
};

export const createAboutEntry = async ({ userId, payload }) => {
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
    return formatEntry(updated);
  }

  const [created] = await About.create([
    {
      key: ABOUT_KEY,
      title: payload.title.trim(),
      subTitle: payload.subTitle?.trim() || "",
      description: payload.description.trim(),
      socialLinks: payload.socialLinks || [],
      extraFields: payload.extraFields || [],
      image: payload.image || null,
      createdBy: userId,
      updatedBy: userId,
    },
  ]);

  const entry = await About.findById(created._id).populate(basePopulate).lean();
  return formatEntry(entry);
};

export const getAboutEntryForAdmin = async () => {
  const entry = await findExistingAboutLean();
  if (!entry) throw notFound("About data not found", "ABOUT_NOT_FOUND");
  return formatEntry(entry);
};

export const updateAboutEntry = async ({ userId, payload, hasSocialLinks = false }) => {
  const entry = await findExistingAbout();
  if (!entry) throw notFound("About data not found", "ABOUT_NOT_FOUND");

  applyPayload(entry, payload, { hasSocialLinks });
  entry.key = ABOUT_KEY;
  entry.updatedBy = userId;
  if (!entry.createdBy) entry.createdBy = userId;

  await entry.save();
  const updated = await About.findById(entry._id).populate(basePopulate).lean();
  return formatEntry(updated);
};

export const deleteAboutEntry = async () => {
  const entry = await findExistingAbout();
  if (!entry) throw notFound("About data not found", "ABOUT_NOT_FOUND");

  await About.deleteOne({ _id: entry._id });
  return { deleted: true, id: entry._id.toString() };
};

export const getAboutEntry = async () => {
  const entry = await findExistingAboutLean();
  if (!entry) throw notFound("About data not found", "ABOUT_NOT_FOUND");
  return formatEntry(entry);
};
