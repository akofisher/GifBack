import { normalizeLanguage } from "../../../i18n/localization.js";
import { getRolePermissions, normalizeRole } from "../../admin/rbac/rbac.js";

export const toSafeUser = (user) => ({
  _id: user._id.toString(),
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  emailVerified: Boolean(user.emailVerified),
  phone: user.phone,
  preferredLanguage: normalizeLanguage(user.preferredLanguage),
  role: normalizeRole(user.role),
  permissions: getRolePermissions(user.role),
  isActive: user.isActive,
  avatar: user.avatar,
  stats: user.stats,
  agreementAcceptance: {
    version: user.agreementAcceptance?.version || "",
    acceptedAt: user.agreementAcceptance?.acceptedAt || null,
  },
  dateOfBirth: user.dateOfBirth,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

export const buildPendingRegistrationPreview = ({
  firstName = "",
  lastName = "",
  email = "",
  phone = "",
  preferredLanguage = "en",
  dateOfBirth = null,
}) => ({
  _id: null,
  firstName,
  lastName,
  email,
  phone,
  preferredLanguage: normalizeLanguage(preferredLanguage),
  emailVerified: false,
  role: "user",
  permissions: getRolePermissions("user"),
  isActive: false,
  avatar: null,
  stats: {
    giving: 0,
    exchanging: 0,
    exchanged: 0,
    given: 0,
  },
  agreementAcceptance: {
    version: "",
    acceptedAt: null,
  },
  dateOfBirth,
  createdAt: null,
  updatedAt: null,
});
