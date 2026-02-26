export const ROLE = Object.freeze({
  USER: "user",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
});

export const ADMIN_PERMISSIONS = Object.freeze({
  STATS_VIEW: "admin.stats.view",
  LEADERBOARD_VIEW: "admin.leaderboard.view",

  USERS_LIST: "admin.users.list",
  USERS_STATUS_UPDATE: "admin.users.status.update",
  USERS_DELETE: "admin.users.delete",

  STAFF_LIST: "admin.staff.list",
  STAFF_CREATE: "admin.staff.create",

  CATEGORIES_MANAGE: "admin.categories.manage",
  LOCATIONS_MANAGE: "admin.locations.manage",
  ITEMS_MANAGE: "admin.items.manage",
  REPORTS_MANAGE: "admin.reports.manage",

  BLOGS_MANAGE: "admin.blogs.manage",
  ABOUT_MANAGE: "admin.about.manage",
  DONATIONS_MANAGE: "admin.donations.manage",

  APP_VERSION_MANAGE: "admin.app_version.manage",
  AGREEMENT_MANAGE: "admin.agreement.manage",

  MONITORING_VIEW: "admin.monitoring.view",
});

const ADMIN_BASE_PERMISSIONS = Object.freeze([
  ADMIN_PERMISSIONS.STATS_VIEW,
  ADMIN_PERMISSIONS.LEADERBOARD_VIEW,

  ADMIN_PERMISSIONS.USERS_LIST,
  ADMIN_PERMISSIONS.USERS_STATUS_UPDATE,

  ADMIN_PERMISSIONS.CATEGORIES_MANAGE,
  ADMIN_PERMISSIONS.LOCATIONS_MANAGE,
  ADMIN_PERMISSIONS.ITEMS_MANAGE,
  ADMIN_PERMISSIONS.REPORTS_MANAGE,

  ADMIN_PERMISSIONS.BLOGS_MANAGE,
  ADMIN_PERMISSIONS.ABOUT_MANAGE,
  ADMIN_PERMISSIONS.DONATIONS_MANAGE,
]);

const SUPER_ADMIN_ONLY_PERMISSIONS = Object.freeze([
  ADMIN_PERMISSIONS.USERS_DELETE,
  ADMIN_PERMISSIONS.STAFF_LIST,
  ADMIN_PERMISSIONS.STAFF_CREATE,
  ADMIN_PERMISSIONS.APP_VERSION_MANAGE,
  ADMIN_PERMISSIONS.AGREEMENT_MANAGE,
  ADMIN_PERMISSIONS.MONITORING_VIEW,
]);

const ROLE_PERMISSION_MAP = Object.freeze({
  [ROLE.USER]: Object.freeze([]),
  [ROLE.ADMIN]: ADMIN_BASE_PERMISSIONS,
  [ROLE.SUPER_ADMIN]: Object.freeze([
    ...ADMIN_BASE_PERMISSIONS,
    ...SUPER_ADMIN_ONLY_PERMISSIONS,
  ]),
});

export const normalizeRole = (role) => {
  const value = String(role || "").trim().toLowerCase();
  if (value === ROLE.ADMIN) return ROLE.ADMIN;
  if (value === ROLE.SUPER_ADMIN) return ROLE.SUPER_ADMIN;
  return ROLE.USER;
};

export const isSuperAdminRole = (role) => normalizeRole(role) === ROLE.SUPER_ADMIN;

export const isAdminRole = (role) => {
  const normalized = normalizeRole(role);
  return normalized === ROLE.ADMIN || normalized === ROLE.SUPER_ADMIN;
};

export const getRolePermissions = (role) =>
  ROLE_PERMISSION_MAP[normalizeRole(role)] || ROLE_PERMISSION_MAP[ROLE.USER];

export const hasPermission = (role, permission) =>
  getRolePermissions(role).includes(permission);

export const canManageTargetRole = ({ actorRole, targetRole }) => {
  const actor = normalizeRole(actorRole);
  const target = normalizeRole(targetRole);

  if (target === ROLE.SUPER_ADMIN) {
    return false;
  }

  if (actor === ROLE.SUPER_ADMIN) {
    return target === ROLE.ADMIN || target === ROLE.USER;
  }

  if (actor === ROLE.ADMIN) {
    return target === ROLE.USER;
  }

  return false;
};
