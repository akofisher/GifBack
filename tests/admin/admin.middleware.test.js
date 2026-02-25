import assert from "node:assert/strict";
import test from "node:test";
import { requireAdmin } from "../../src/modules/admin/middleware/admin.middleware.js";

test("requireAdmin returns FORBIDDEN for non-admin role", async () => {
  await new Promise((resolve, reject) => {
    requireAdmin(
      { user: { role: "user" } },
      {},
      (error) => {
        try {
          assert.ok(error);
          assert.equal(error.code, "FORBIDDEN");
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
      { user: { role: "admin" } },
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
