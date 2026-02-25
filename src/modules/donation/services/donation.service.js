import mongoose from "mongoose";
import Donation from "../models/donation.model.js";

const DONATION_KEY = "DONATION_SETTINGS";

const sortMethods = (methods = []) =>
  [...methods].sort((a, b) => {
    if ((a.order || 0) !== (b.order || 0)) {
      return (a.order || 0) - (b.order || 0);
    }
    return (a.label || "").localeCompare(b.label || "");
  });

const toPlainId = (value) => value?._id?.toString?.() || value?.toString?.() || "";

const formatMethod = (method) => ({
  id: toPlainId(method._id),
  label: method.label || "",
  accountNumber: method.accountNumber || "",
  link: method.link || "",
  isActive: Boolean(method.isActive),
  order: Number(method.order || 0),
});

const formatConfig = (doc) => ({
  key: doc.key,
  methods: sortMethods(doc.methods || []).map(formatMethod),
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
  const normalized = {
    label: method.label.trim(),
    accountNumber: method.accountNumber.trim(),
    link: (method.link || "").trim(),
    isActive: method.isActive !== undefined ? Boolean(method.isActive) : true,
    order: Number.isInteger(method.order) ? method.order : index,
  };

  if (method.id && mongoose.Types.ObjectId.isValid(method.id)) {
    normalized._id = method.id;
  }

  return normalized;
};

export const getPublicDonations = async () => {
  const config = await ensureDonationConfig();
  const methods = sortMethods(config.methods || [])
    .filter((method) => method.isActive)
    .map((method) => ({
      id: toPlainId(method._id),
      label: method.label || "",
      accountNumber: method.accountNumber || "",
      link: method.link || "",
      order: Number(method.order || 0),
    }));

  return {
    methods,
    updatedAt: config.updatedAt,
  };
};

export const getAdminDonations = async () => {
  const config = await ensureDonationConfig();
  return formatConfig(config);
};

export const updateAdminDonations = async ({ userId, payload }) => {
  const config = await ensureDonationConfig();

  config.methods = (payload.methods || []).map(normalizeMethodInput);
  if (!config.createdBy) {
    config.createdBy = userId;
  }
  config.updatedBy = userId;

  await config.save();
  return formatConfig(config);
};
