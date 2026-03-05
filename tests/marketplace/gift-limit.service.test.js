import assert from "node:assert/strict";
import test from "node:test";
import {
  GIFT_LIMIT_PER_WINDOW,
  GIFT_LIMIT_WINDOW_MS,
  ensureWeeklyGiftLimit,
  getGiftLimitRetryAt,
  getGiftLimitWindowStart,
  isWithinGiftLimitWindow,
} from "../../src/modules/marketplace/services/gift-limit.service.js";

const buildRequestModel = ({ results = [], capture } = {}) => ({
  find(filter) {
    if (capture) capture.filter = filter;

    const query = {
      sort(sortArg) {
        if (capture) capture.sort = sortArg;
        return query;
      },
      limit(limitArg) {
        if (capture) capture.limit = limitArg;
        return query;
      },
      select(selectArg) {
        if (capture) capture.select = selectArg;
        return query;
      },
      session(sessionArg) {
        if (capture) capture.session = sessionArg;
        return query;
      },
      lean: async () => results,
    };

    return query;
  },
});

const buildQueuedRequestModel = (queue) => ({
  find() {
    const current = queue.shift() || [];
    const query = {
      sort() {
        return query;
      },
      limit() {
        return query;
      },
      select() {
        return query;
      },
      session() {
        return query;
      },
      lean: async () => current,
    };
    return query;
  },
});

const buildRequestModelByStatus = ({ byStatus = {}, capture } = {}) => ({
  find(filter) {
    if (capture) {
      capture.filters = capture.filters || [];
      capture.filters.push(filter);
    }
    const results = byStatus[filter?.status] || [];
    const query = {
      sort() {
        return query;
      },
      limit() {
        return query;
      },
      select() {
        return query;
      },
      session() {
        return query;
      },
      lean: async () => results,
    };
    return query;
  },
});

test("create request is blocked when weekly gift limit is reached", async () => {
  const now = new Date("2026-02-19T12:00:00.000Z");
  const firstCompletedAt = new Date("2026-02-17T12:00:00.000Z");
  const secondCompletedAt = new Date("2026-02-18T12:00:00.000Z");
  const model = buildRequestModel({
    results: [{ completedAt: firstCompletedAt }, { completedAt: secondCompletedAt }],
  });

  await assert.rejects(
    ensureWeeklyGiftLimit({
      ownerId: "owner-1",
      receiverId: "receiver-1",
      now,
      transactionModel: model,
      requestModel: buildRequestModel({ results: [] }),
    }),
    (err) => {
      assert.equal(err.code, "GIFT_LIMIT_WEEKLY");
      assert.equal(err.message, "Weekly gift limit reached");
      assert.ok(Array.isArray(err.details));
      assert.equal(err.details[0]?.field, "retryAt");
      assert.equal(
        err.details[0]?.message,
        getGiftLimitRetryAt(firstCompletedAt).toISOString()
      );
      return true;
    }
  );
});

test("first and second gifts are allowed, third is blocked", async () => {
  const now = new Date("2026-02-19T12:00:00.000Z");

  await ensureWeeklyGiftLimit({
    ownerId: "owner-1",
    receiverId: "receiver-1",
    now,
    transactionModel: buildRequestModel({ results: [] }),
    requestModel: buildRequestModel({ results: [] }),
  });

  await ensureWeeklyGiftLimit({
    ownerId: "owner-1",
    receiverId: "receiver-1",
    now,
    transactionModel: buildRequestModel({
      results: [{ completedAt: new Date("2026-02-18T12:00:00.000Z") }],
    }),
    requestModel: buildRequestModel({ results: [] }),
  });

  await assert.rejects(
    ensureWeeklyGiftLimit({
      ownerId: "owner-1",
      receiverId: "receiver-1",
      now,
      transactionModel: buildRequestModel({
        results: [
          { completedAt: new Date("2026-02-17T12:00:00.000Z") },
          { completedAt: new Date("2026-02-18T12:00:00.000Z") },
        ],
      }),
      requestModel: buildRequestModel({ results: [] }),
    }),
    (err) => err?.code === "GIFT_LIMIT_WEEKLY"
  );
});

test("approve request is blocked when weekly gift limit is reached", async () => {
  const now = new Date("2026-02-19T12:00:00.000Z");
  const firstCompletedAt = new Date("2026-02-17T12:00:00.000Z");
  const secondCompletedAt = new Date("2026-02-18T12:00:00.000Z");
  const capture = {};
  const session = { id: "session-approve" };
  const model = buildRequestModel({
    results: [{ completedAt: firstCompletedAt }, { completedAt: secondCompletedAt }],
    capture,
  });

  await assert.rejects(
    ensureWeeklyGiftLimit({
      ownerId: "owner-1",
      receiverId: "receiver-1",
      session,
      now,
      transactionModel: model,
      requestModel: buildRequestModel({ results: [] }),
    }),
    (err) => {
      assert.equal(err.code, "GIFT_LIMIT_WEEKLY");
      return true;
    }
  );

  assert.equal(capture.session, session);
  assert.ok(capture.limit >= GIFT_LIMIT_PER_WINDOW);
});

test("week rollover boundary allows request exactly at +7 days", async () => {
  const now = new Date("2026-02-19T12:00:00.000Z");
  const boundaryCompletedAt = new Date(now.getTime() - GIFT_LIMIT_WINDOW_MS);

  assert.equal(isWithinGiftLimitWindow(boundaryCompletedAt, now), false);
  assert.equal(
    isWithinGiftLimitWindow(new Date(boundaryCompletedAt.getTime() + 1), now),
    true
  );

  const capture = {};
  const model = buildRequestModel({
    results: [{ completedAt: boundaryCompletedAt }],
    capture,
  });

  await ensureWeeklyGiftLimit({
    ownerId: "owner-1",
    receiverId: "receiver-1",
    now,
    transactionModel: model,
    requestModel: buildRequestModel({ results: [] }),
  });

  assert.equal(
    capture.filter.completedAt.$gt.toISOString(),
    getGiftLimitWindowStart(now).toISOString()
  );
});

test("concurrent gift-limit checks allow only one valid call when one call sees recent completion", async () => {
  const now = new Date("2026-02-19T12:00:00.000Z");
  const model = buildQueuedRequestModel([
    [{ completedAt: new Date("2026-02-18T10:00:00.000Z") }],
    [
      { completedAt: new Date("2026-02-18T10:00:00.000Z") },
      { completedAt: new Date("2026-02-19T10:00:00.000Z") },
    ],
  ]);

  const results = await Promise.allSettled([
    ensureWeeklyGiftLimit({
      ownerId: "owner-1",
      receiverId: "receiver-1",
      now,
      transactionModel: model,
      requestModel: buildQueuedRequestModel([[], []]),
    }),
    ensureWeeklyGiftLimit({
      ownerId: "owner-1",
      receiverId: "receiver-1",
      now,
      transactionModel: model,
      requestModel: buildQueuedRequestModel([[], []]),
    }),
  ]);

  const fulfilledCount = results.filter((r) => r.status === "fulfilled").length;
  const rejected = results.find((r) => r.status === "rejected");

  assert.equal(fulfilledCount, 1);
  assert.ok(rejected);
  assert.equal(rejected.reason.code, "GIFT_LIMIT_WEEKLY");
});

test("create/approve pre-check blocks when approved gifts already consume remaining slot", async () => {
  const now = new Date("2026-02-19T12:00:00.000Z");
  const completedAt = new Date("2026-02-18T12:00:00.000Z");
  const approvedExpiresAt = new Date("2026-02-19T20:00:00.000Z");
  const requestModel = buildRequestModelByStatus({
    byStatus: {
      COMPLETED: [],
      APPROVED: [{ _id: "req-approved-1", expiresAt: approvedExpiresAt }],
    },
  });

  await assert.rejects(
    ensureWeeklyGiftLimit({
      ownerId: "owner-1",
      receiverId: "receiver-1",
      now,
      includeApproved: true,
      transactionModel: buildRequestModel({
        results: [{ completedAt }],
      }),
      requestModel,
    }),
    (err) => {
      assert.equal(err.code, "GIFT_LIMIT_WEEKLY");
      assert.equal(err.details?.[0]?.field, "retryAt");
      assert.equal(err.details?.[0]?.message, approvedExpiresAt.toISOString());
      return true;
    }
  );
});

test("approved gifts with expired expiresAt do not block new request", async () => {
  const now = new Date("2026-02-19T12:00:00.000Z");
  const requestModel = buildRequestModelByStatus({
    byStatus: {
      COMPLETED: [],
      APPROVED: [{ _id: "req-approved-expired", expiresAt: new Date("2026-02-18T12:00:00.000Z") }],
    },
  });

  await ensureWeeklyGiftLimit({
    ownerId: "owner-1",
    receiverId: "receiver-1",
    now,
    includeApproved: true,
    transactionModel: buildRequestModel({ results: [] }),
    requestModel,
  });
});
