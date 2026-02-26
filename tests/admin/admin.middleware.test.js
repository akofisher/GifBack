import assert from "node:assert/strict";
import test from "node:test";
import {
  requireAdmin,
  requirePermission,
  requireSuperAdmin,
} from "../../src/modules/admin/middleware/admin.middleware.js";
import { ADMIN_PERMISSIONS } from "../../src/modules/admin/rbac/rbac.js";

test("requireAdmin returns ADMIN_ACCESS_REQUIRED for non-admin role", async () => {
  await new Promise((resolve, reject) => {
    requireAdmin(
      { user: { role: "user", resolvedRole: "user" } },
      {},
      (error) => {
        try {
          assert.ok(error);
          assert.equal(error.code, "ADMIN_ACCESS_REQUIRED");
          resolve();
        } catch (assertionError) {
          reject(assertionError);
        }
      }
    );
  });
});

test("requireAdmin allows admin role", async () => {
  await new Promise((resolve, reject) => {
    requireAdmin(
      { user: { role: "admin", resolvedRole: "admin" } },
      {},
      (error) => {
        try {
          assert.equal(error, undefined);
          resolve();
        } catch (assertionError) {
          reject(assertionError);
        }
      }
    );
  });
});

test("requireAdmin allows super_admin role", async () => {
  await new Promise((resolve, reject) => {
    requireAdmin(
      { user: { role: "super_admin", resolvedRole: "super_admin" } },
      {},
      (error) => {
        try {
          assert.equal(error, undefined);
          resolve();
        } catch (assertionError) {
          reject(assertionError);
        }
      }
    );
  });
});

test("requireSuperAdmin blocks admin role", async () => {
  await new Promise((resolve, reject) => {
    requireSuperAdmin(
      { user: { role: "admin", resolvedRole: "admin" } },
      {},
      (error) => {
        try {
          assert.ok(error);
          assert.equal(error.code, "SUPER_ADMIN_REQUIRED");
          resolve();
        } catch (assertionError) {
          reject(assertionError);
        }
      }
    );
  });
});

test("requirePermission allows admin permission", async () => {
  await new Promise((resolve, reject) => {
    const middleware = requirePermission(ADMIN_PERMISSIONS.ITEMS_MANAGE);
    middleware(
      { user: { role: "admin", resolvedRole: "admin" } },
      {},
      (error) => {
        try {
          assert.equal(error, undefined);
          resolve();
        } catch (assertionError) {
          reject(assertionError);
        }
      }
    );
  });
});

test("requirePermission blocks missing permission", async () => {
  await new Promise((resolve, reject) => {
    const middleware = requirePermission(ADMIN_PERMISSIONS.MONITORING_VIEW);
    middleware(
      { user: { role: "admin", resolvedRole: "admin" } },
      {},
      (error) => {
        try {
          assert.ok(error);
          assert.equal(error.code, "ADMIN_PERMISSION_DENIED");
          resolve();
        } catch (assertionError) {
          reject(assertionError);
        }
      }
    );
  });
});
