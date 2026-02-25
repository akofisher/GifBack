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
    ...entry,
    createdBy: formatUserRef(entry.createdBy),
    updatedBy: formatUserRef(entry.updatedBy),
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

const applyPayload = (target, payload) => {
  if (payload.title !== undefined) target.title = payload.title.trim();
  if (payload.subTitle !== undefined) target.subTitle = payload.subTitle.trim();
  if (payload.description !== undefined)
    target.description = payload.description.trim();

  if (payload.contactPhone1 !== undefined)
    target.contactPhone1 = payload.contactPhone1.trim();
  if (payload.contactPhone2 !== undefined)
    target.contactPhone2 = payload.contactPhone2.trim();

  if (payload.email1 !== undefined) target.email1 = payload.email1.trim();
  if (payload.email2 !== undefined) target.email2 = payload.email2.trim();

  if (payload.facebookLink !== undefined) target.facebookLink = payload.facebookLink;
  if (payload.instagramLink !== undefined)
    target.instagramLink = payload.instagramLink;
  if (payload.linkedinLink !== undefined) target.linkedinLink = payload.linkedinLink;
  if (payload.tiktokLink !== undefined) target.tiktokLink = payload.tiktokLink;
  if (payload.youtubeLink !== undefined) target.youtubeLink = payload.youtubeLink;

  if (payload.socialLinks !== undefined) target.socialLinks = payload.socialLinks;
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
      contactPhone1: payload.contactPhone1?.trim() || "",
      contactPhone2: payload.contactPhone2?.trim() || "",
      email1: payload.email1?.trim() || "",
      email2: payload.email2?.trim() || "",
      facebookLink: payload.facebookLink || "",
      instagramLink: payload.instagramLink || "",
      linkedinLink: payload.linkedinLink || "",
      tiktokLink: payload.tiktokLink || "",
      youtubeLink: payload.youtubeLink || "",
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

export const updateAboutEntry = async ({ userId, payload }) => {
  const entry = await findExistingAbout();
  if (!entry) throw notFound("About data not found", "ABOUT_NOT_FOUND");

  applyPayload(entry, payload);
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
