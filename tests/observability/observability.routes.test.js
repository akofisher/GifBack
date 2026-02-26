import assert from "node:assert/strict";
import test from "node:test";

import observabilityRouter from "../../src/modules/observability/routes/observability.routes.js";

const getMonitoringLayers = () =>
  observabilityRouter.stack.filter(
    (layer) => layer.route && layer.route.path.startsWith("/admin/monitoring/")
  );

test("all monitoring routes are registered", () => {
  const layers = getMonitoringLayers();
  const paths = layers.map((layer) => layer.route.path).sort();

  assert.deepEqual(paths, [
    "/admin/monitoring/audit-logs",
    "/admin/monitoring/filter-actors",
    "/admin/monitoring/filter-items",
    "/admin/monitoring/filter-options",
    "/admin/monitoring/filter-requests",
    "/admin/monitoring/marketplace-events",
    "/admin/monitoring/overview",
    "/admin/monitoring/requests",
  ]);
});

test("all monitoring routes deny admin role without monitoring permission", async () => {
  const layers = getMonitoringLayers();

  for (const layer of layers) {
    const permissionMiddleware = layer.route.stack[1]?.handle;
    assert.equal(typeof permissionMiddleware, "function");

    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve, reject) => {
      permissionMiddleware(
        {
          user: {
            id: "65ff1b2c5f11a4b3a88f3003",
            role: "admin",
            resolvedRole: "admin",
          },
        },
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
  }
});

test("all monitoring routes allow super_admin role", async () => {
  const layers = getMonitoringLayers();

  for (const layer of layers) {
    const permissionMiddleware = layer.route.stack[1]?.handle;
    assert.equal(typeof permissionMiddleware, "function");

    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve, reject) => {
      permissionMiddleware(
        {
          user: {
            id: "65ff1b2c5f11a4b3a88f3004",
            role: "super_admin",
            resolvedRole: "super_admin",
          },
        },
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
  }
});
