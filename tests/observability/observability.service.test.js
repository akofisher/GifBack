import assert from "node:assert/strict";
import test from "node:test";

import User from "../../src/modules/user/models/user.model.js";
import Item from "../../src/modules/marketplace/models/item.model.js";
import ApiRequestMetric from "../../src/modules/observability/models/api-request-metric.model.js";
import {
  computePercentile,
  listAdminAuditLogs,
  listMarketplaceEvents,
  listMonitoringFilterActors,
  listMonitoringFilterItems,
  resolveMonitoringWindow,
  sanitizeAuditPayload,
} from "../../src/modules/observability/services/observability.service.js";

test("default monitoring window resolves to last_7d and is marked default", () => {
  const now = new Date("2026-02-26T12:00:00.000Z");
  const window = resolveMonitoringWindow({}, now);

  assert.equal(window.preset, "last_7d");
  assert.equal(window.tz, "UTC");
  assert.equal(window.isDefault, true);
  assert.equal(window.to, now.toISOString());
  assert.equal(
    window.from,
    new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  );
});

test("custom from/to has precedence over preset and days", () => {
  const now = new Date("2026-02-26T12:00:00.000Z");
  const window = resolveMonitoringWindow(
    {
      preset: "last_30d",
      days: 30,
      from: "2026-02-01T00:00:00.000Z",
      to: "2026-02-02T00:00:00.000Z",
      tz: "Asia/Tbilisi",
    },
    now
  );

  assert.equal(window.preset, "custom");
  assert.equal(window.tz, "Asia/Tbilisi");
  assert.equal(window.isDefault, false);
  assert.equal(window.from, "2026-02-01T00:00:00.000Z");
  assert.equal(window.to, "2026-02-02T00:00:00.000Z");
});

test("today preset respects timezone and custom window semantics", () => {
  const now = new Date("2026-02-26T12:00:00.000Z");
  const window = resolveMonitoringWindow(
    {
      preset: "today",
      tz: "Asia/Tbilisi",
    },
    now
  );

  assert.equal(window.preset, "today");
  assert.equal(window.tz, "Asia/Tbilisi");
  assert.equal(window.isDefault, false);
  assert.equal(window.to, now.toISOString());
  assert.ok(new Date(window.from) < now);
});

test("invalid date range with only one boundary throws MONITORING_DATE_RANGE_INVALID", () => {
  assert.throws(
    () =>
      resolveMonitoringWindow({
        from: "2026-02-01T00:00:00.000Z",
      }),
    (err) => {
      assert.equal(err.code, "MONITORING_DATE_RANGE_INVALID");
      assert.equal(err.status, 422);
      return true;
    }
  );
});

test("invalid date range where from is after to throws MONITORING_DATE_RANGE_INVALID", () => {
  assert.throws(
    () =>
      resolveMonitoringWindow({
        from: "2026-02-03T00:00:00.000Z",
        to: "2026-02-02T00:00:00.000Z",
      }),
    (err) => {
      assert.equal(err.code, "MONITORING_DATE_RANGE_INVALID");
      assert.equal(err.status, 422);
      return true;
    }
  );
});

test("range greater than 90 days throws MONITORING_DATE_RANGE_TOO_LARGE", () => {
  assert.throws(
    () =>
      resolveMonitoringWindow({
        from: "2025-10-01T00:00:00.000Z",
        to: "2026-02-26T00:00:00.000Z",
      }),
    (err) => {
      assert.equal(err.code, "MONITORING_DATE_RANGE_TOO_LARGE");
      assert.equal(err.status, 422);
      return true;
    }
  );
});

test("computePercentile handles boundaries and empty arrays", () => {
  assert.equal(computePercentile([], 50), 0);
  assert.equal(computePercentile([1, 2, 3, 4], 0), 1);
  assert.equal(computePercentile([1, 2, 3, 4], 50), 2);
  assert.equal(computePercentile([1, 2, 3, 4], 95), 4);
});

test("sanitizeAuditPayload redacts sensitive fields recursively", () => {
  const payload = {
    email: "a@example.com",
    password: "secret",
    nested: {
      refreshToken: "abc",
      safe: "ok",
    },
    list: [
      {
        currentPassword: "qwerty",
        title: "visible",
      },
    ],
  };

  const sanitized = sanitizeAuditPayload(payload);

  assert.equal(sanitized.email, "a@example.com");
  assert.equal(sanitized.password, "[REDACTED]");
  assert.equal(sanitized.nested.refreshToken, "[REDACTED]");
  assert.equal(sanitized.nested.safe, "ok");
  assert.equal(sanitized.list[0].currentPassword, "[REDACTED]");
  assert.equal(sanitized.list[0].title, "visible");
});

test("invalid ObjectId filter for audit logs returns 200-style empty payload", async () => {
  const result = await listAdminAuditLogs({ actorId: "invalid-id" });
  assert.equal(Array.isArray(result.logs), true);
  assert.equal(result.logs.length, 0);
  assert.equal(result.pagination.total, 0);
  assert.equal(result.window.preset, "last_7d");
});

test("invalid ObjectId filter for marketplace events returns empty payload", async () => {
  const result = await listMarketplaceEvents({ itemId: "bad-id" });
  assert.equal(Array.isArray(result.events), true);
  assert.equal(result.events.length, 0);
  assert.equal(result.pagination.total, 0);
  assert.equal(result.window.preset, "last_7d");
});

test("filter actors lookup supports id search", async () => {
  const actorId = "65ff1b2c5f11a4b3a88f1001";
  const restore = {
    findById: User.findById,
    aggregate: ApiRequestMetric.aggregate,
  };

  User.findById = () => ({
    select() {
      return this;
    },
    lean: async () => ({
      _id: actorId,
      firstName: "Gifter",
      lastName: "Admin",
      email: "admin@gifter.app",
      role: "super_admin",
    }),
  });

  ApiRequestMetric.aggregate = async () => [
    { _id: actorId, lastSeenAt: new Date("2026-02-26T11:00:00.000Z") },
  ];

  try {
    const result = await listMonitoringFilterActors({ q: actorId, limit: 20 });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].id, actorId);
    assert.equal(result.items[0].email, "admin@gifter.app");
    assert.equal(result.items[0].role, "super_admin");
    assert.ok(result.items[0].lastSeenAt);
  } finally {
    User.findById = restore.findById;
    ApiRequestMetric.aggregate = restore.aggregate;
  }
});

test("filter items lookup supports text search", async () => {
  const restore = {
    userFind: User.find,
    itemFind: Item.find,
  };

  User.find = () => ({
    select() {
      return this;
    },
    limit() {
      return this;
    },
    sort() {
      return this;
    },
    lean: async () => [{ _id: "65ff1b2c5f11a4b3a88f2002" }],
  });

  Item.find = () => ({
    select() {
      return this;
    },
    sort() {
      return this;
    },
    limit() {
      return this;
    },
    populate() {
      return this;
    },
    lean: async () => [
      {
        _id: "65ff5acdd4179bbf58779dc8",
        title: "Mountain Bike",
        mode: "EXCHANGE",
        status: "ACTIVE",
        ownerId: { firstName: "Ana", lastName: "K" },
      },
    ],
  });

  try {
    const result = await listMonitoringFilterItems({ q: "bike", limit: 20 });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].title, "Mountain Bike");
    assert.equal(result.items[0].ownerName, "Ana K");
  } finally {
    User.find = restore.userFind;
    Item.find = restore.itemFind;
  }
});
