import {
  getAdminDonations,
  getPublicDonations,
  updateAdminDonations,
} from "../services/donation.service.js";
import { upsertDonationConfigSchema } from "../validators/donation.validators.js";
import {
  buildWeakEtag,
  isRequestFresh,
  setCacheValidators,
} from "../../../utils/httpCache.js";

export const getPublicDonationsHandler = async (req, res, next) => {
  try {
    const data = await getPublicDonations();
    const lastModified = data.updatedAt || null;
    const etag = buildWeakEtag({
      resource: "donations",
      total: data.methods?.length || 0,
      updatedAt: data.updatedAt || null,
    });
    setCacheValidators(res, { etag, lastModified });
    if (isRequestFresh(req, { etag, lastModified })) {
      return res.status(304).end();
    }

    res.status(200).json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};

export const getAdminDonationsHandler = async (req, res, next) => {
  try {
    const config = await getAdminDonations();
    res.status(200).json({ success: true, config });
  } catch (error) {
    next(error);
  }
};

export const updateAdminDonationsHandler = async (req, res, next) => {
  try {
    const payload = upsertDonationConfigSchema.parse(req.body || {});
    const config = await updateAdminDonations({
      userId: req.user.id,
      payload,
    });

    res.status(200).json({
      success: true,
      message: "Donation settings updated",
      config,
    });
  } catch (error) {
    next(error);
  }
};
