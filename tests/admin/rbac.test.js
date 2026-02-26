import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_PERMISSIONS,
  ROLE,
  canManageTargetRole,
  getRolePermissions,
  hasPermission,
  isAdminRole,
  isSuperAdminRole,
  normalizeRole,
} from "../../src/modules/admin/rbac/rbac.js";

test("normalizeRole maps unknown role to user", () => {
  assert.equal(normalizeRole("ADMIN"), ROLE.ADMIN);
  assert.equal(normalizeRole("super_admin"), ROLE.SUPER_ADMIN);
  assert.equal(normalizeRole("something_else"), ROLE.USER);
});

test("admin and super_admin role checks", () => {
  assert.equal(isAdminRole(ROLE.USER), false);
  assert.equal(isAdminRole(ROLE.ADMIN), true);
  assert.equal(isAdminRole(ROLE.SUPER_ADMIN), true);
  assert.equal(isSuperAdminRole(ROLE.SUPER_ADMIN), true);
  assert.equal(isSuperAdminRole(ROLE.ADMIN), false);
});

test("permissions are role-based", () => {
  assert.equal(
    hasPermission(ROLE.ADMIN, ADMIN_PERMISSIONS.ITEMS_MANAGE),
    true
  );
  assert.equal(
    hasPermission(ROLE.ADMIN, ADMIN_PERMISSIONS.MONITORING_VIEW),
    false
  );
  assert.equal(
    hasPermission(ROLE.SUPER_ADMIN, ADMIN_PERMISSIONS.MONITORING_VIEW),
    true
  );

  const userPermissions = getRolePermissions(ROLE.USER);
  assert.deepEqual(userPermissions, []);
});

test("canManageTargetRole enforces hierarchy", () => {
  assert.equal(
    canManageTargetRole({ actorRole: ROLE.ADMIN, targetRole: ROLE.USER }),
    true
  );
  assert.equal(
    canManageTargetRole({ actorRole: ROLE.ADMIN, targetRole: ROLE.ADMIN }),
    false
  );
  assert.equal(
    canManageTargetRole({ actorRole: ROLE.SUPER_ADMIN, targetRole: ROLE.ADMIN }),
    true
  );
  assert.equal(
    canManageTargetRole({ actorRole: ROLE.SUPER_ADMIN, targetRole: ROLE.SUPER_ADMIN }),
    false
  );
});
