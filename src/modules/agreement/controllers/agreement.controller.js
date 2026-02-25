import {
  getAdminAgreement,
  getPublicAgreement,
  upsertAgreement,
} from "../services/agreement.service.js";
import { upsertAgreementSchema } from "../validators/agreement.validators.js";

export const getPublicAgreementHandler = async (req, res, next) => {
  try {
    const agreement = await getPublicAgreement();
    res.status(200).json({ success: true, agreement });
  } catch (err) {
    next(err);
  }
};

export const getAdminAgreementHandler = async (req, res, next) => {
  try {
    const agreement = await getAdminAgreement();
    res.status(200).json({ success: true, agreement });
  } catch (err) {
    next(err);
  }
};

export const upsertAgreementHandler = async (req, res, next) => {
  try {
    const payload = upsertAgreementSchema.parse(req.body || {});
    const agreement = await upsertAgreement({ payload, userId: req.user.id });
    res.status(200).json({
      success: true,
      message: "Agreement updated successfully",
      agreement,
    });
  } catch (err) {
    next(err);
  }
};
