import { badRequest, conflict, notFound } from "../../../utils/appError.js";
import Agreement from "../models/agreement.model.js";

const AGREEMENT_KEY = "USER_REGISTRATION_AGREEMENT";
const REGISTRATION_REQUIRE_AGREEMENT =
  (process.env.REGISTRATION_REQUIRE_AGREEMENT || "true").toLowerCase() === "true";

const normalizeVersion = (value) => String(value || "").trim();

const formatAgreement = (agreement) => {
  if (!agreement) return null;
  return {
    _id: agreement._id?.toString?.() || agreement._id,
    key: agreement.key,
    version: agreement.version,
    title: agreement.title,
    content: agreement.content,
    isActive: Boolean(agreement.isActive),
    createdBy: agreement.createdBy || null,
    updatedBy: agreement.updatedBy || null,
    createdAt: agreement.createdAt,
    updatedAt: agreement.updatedAt,
  };
};

const findAgreementDoc = async () =>
  Agreement.findOne({ key: AGREEMENT_KEY }).sort({ updatedAt: -1 });

export const getPublicAgreement = async () => {
  const agreement = await Agreement.findOne({ key: AGREEMENT_KEY, isActive: true }).lean();
  if (!agreement) {
    throw notFound("User agreement is not available", "AGREEMENT_NOT_FOUND");
  }
  return formatAgreement(agreement);
};

export const getAdminAgreement = async () => {
  const agreement = await findAgreementDoc();
  if (!agreement) {
    throw notFound("User agreement is not available", "AGREEMENT_NOT_FOUND");
  }
  return formatAgreement(agreement.toObject());
};

export const upsertAgreement = async ({ payload, userId }) => {
  const existing = await findAgreementDoc();
  if (existing) {
    existing.version = normalizeVersion(payload.version);
    existing.title = payload.title.trim();
    existing.content = payload.content.trim();
    if (payload.isActive !== undefined) {
      existing.isActive = Boolean(payload.isActive);
    }
    existing.updatedBy = userId;
    if (!existing.createdBy) {
      existing.createdBy = userId;
    }
    await existing.save();
    return formatAgreement(existing.toObject());
  }

  const agreement = await Agreement.create({
    key: AGREEMENT_KEY,
    version: normalizeVersion(payload.version),
    title: payload.title.trim(),
    content: payload.content.trim(),
    isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : true,
    createdBy: userId,
    updatedBy: userId,
  });

  return formatAgreement(agreement.toObject());
};

export const resolveAgreementAcceptance = ({
  activeAgreement,
  agreementAccepted,
  agreementVersion,
  registrationRequireAgreement = REGISTRATION_REQUIRE_AGREEMENT,
  now = new Date(),
}) => {
  if (!registrationRequireAgreement) {
    if (!activeAgreement || agreementAccepted !== true) return null;
    if (normalizeVersion(agreementVersion) !== normalizeVersion(activeAgreement.version)) {
      throw conflict("Agreement version is outdated", "AGREEMENT_VERSION_MISMATCH", [
        { field: "latestVersion", message: activeAgreement.version },
      ]);
    }
    return {
      version: normalizeVersion(activeAgreement.version),
      acceptedAt: now,
    };
  }

  if (!activeAgreement || !activeAgreement.isActive) {
    throw notFound("User agreement is not available", "AGREEMENT_NOT_FOUND");
  }

  if (agreementAccepted !== true) {
    throw badRequest("You must accept the user agreement", "AGREEMENT_REQUIRED", [
      { field: "agreementAccepted", message: "true" },
    ]);
  }

  if (normalizeVersion(agreementVersion) !== normalizeVersion(activeAgreement.version)) {
    throw conflict("Agreement version is outdated", "AGREEMENT_VERSION_MISMATCH", [
      { field: "latestVersion", message: activeAgreement.version },
    ]);
  }

  return {
    version: normalizeVersion(activeAgreement.version),
    acceptedAt: now,
  };
};

export const validateAgreementAcceptanceForRegistration = async ({
  agreementAccepted,
  agreementVersion,
  userAgent = "",
  ip = "",
  now = new Date(),
}) => {
  const activeAgreement = await Agreement.findOne({
    key: AGREEMENT_KEY,
    isActive: true,
  }).lean();

  const acceptance = resolveAgreementAcceptance({
    activeAgreement,
    agreementAccepted,
    agreementVersion,
    now,
  });

  if (!acceptance) return null;

  return {
    ...acceptance,
    ip: String(ip || "").slice(0, 120),
    userAgent: String(userAgent || "").slice(0, 500),
  };
};
