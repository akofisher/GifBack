import {
  createAboutEntry,
  deleteAboutEntry,
  getAboutEntry,
  getAboutEntryForAdmin,
  updateAboutEntry,
} from "../services/about.service.js";
import {
  createAboutSchema,
  updateAboutSchema,
} from "../validators/about.validators.js";
import {
  buildWeakEtag,
  isRequestFresh,
  setCacheValidators,
} from "../../../utils/httpCache.js";

export const createAboutEntryHandler = async (req, res, next) => {
  try {
    const payload = createAboutSchema.parse(req.body);
    const entry = await createAboutEntry({
      userId: req.user.id,
      payload,
      locale: req.locale,
    });
    res.status(201).json({ success: true, entry });
  } catch (err) {
    next(err);
  }
};

export const getAdminAboutEntryHandler = async (req, res, next) => {
  try {
    const entry = await getAboutEntryForAdmin(req.locale);
    res.status(200).json({ success: true, entry });
  } catch (err) {
    next(err);
  }
};

export const updateAboutEntryHandler = async (req, res, next) => {
  try {
    const hasSocialLinks = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "socialLinks"
    );
    const payload = updateAboutSchema.parse(req.body);
    const entry = await updateAboutEntry({
      userId: req.user.id,
      payload,
      hasSocialLinks,
      locale: req.locale,
    });
    res.status(200).json({ success: true, entry });
  } catch (err) {
    next(err);
  }
};

export const deleteAboutEntryHandler = async (req, res, next) => {
  try {
    const result = await deleteAboutEntry();
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

export const getAboutEntryHandler = async (req, res, next) => {
  try {
    const entry = await getAboutEntry(req.locale);
    res.vary("Accept-Language");
    res.vary("X-Language");
    res.vary("X-Lang");
    const lastModified = entry?.updatedAt || entry?.createdAt || null;
    const etag = buildWeakEtag({
      resource: "about",
      locale: req.locale,
      id: entry?._id || null,
      updatedAt: entry?.updatedAt || null,
    });
    setCacheValidators(res, { etag, lastModified });
    if (isRequestFresh(req, { etag, lastModified })) {
      return res.status(304).end();
    }

    res.status(200).json({ success: true, entry });
  } catch (err) {
    next(err);
  }
};
