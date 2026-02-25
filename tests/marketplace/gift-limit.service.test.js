import assert from "node:assert/strict";
import test from "node:test";
import {
  GIFT_LIMIT_WINDOW_MS,
  ensureWeeklyGiftLimit,
  getGiftLimitRetryAt,
  getGiftLimitWindowStart,
  isWithinGiftLimitWindow,
} from "../../src/modules/marketplace/services/gift-limit.service.js";

const buildTransactionModel = ({ result, capture } = {}) => ({
  findOne(filter) {
    if (capture) capture.filter = filter;

    const query = {
      sort(sortArg) {
        if (capture) capture.sort = sortArg;
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
      lean: async () => result,
    };

    return query;
  },
});

const buildQueuedTransactionModel = (queue) => ({
  findOne() {
    const current = queue.shift() || null;
    const query = {
      sort() {
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

test("create request is blocked when weekly gift limit is reached", async () => {
  const now = new Date("2026-02-19T12:00:00.000Z");
  const completedAt = new Date("2026-02-18T12:00:00.000Z");
  const model = buildTransactionModel({ result: { completedAt } });

  await assert.rejects(
    ensureWeeklyGiftLimit({
      ownerId: "owner-1",
      receiverId: "receiver-1",
      now,
      transactionModel: model,
    }),
    (err) => {
      assert.equal(err.code, "GIFT_LIMIT_WEEKLY");
      assert.equal(err.message, "Weekly gift limit reached");
      assert.ok(Array.isArray(err.details));
      assert.equal(err.details[0]?.field, "retryAt");
      assert.equal(
        err.details[0]?.message,
        getGiftLimitRetryAt(completedAt).toISOString()
      );
      return true;
    }
  );
});

test("approve request is blocked when weekly gift limit is reached", async () => {
  const now = new Date("2026-02-19T12:00:00.000Z");
  const completedAt = new Date("2026-02-18T12:00:00.000Z");
  const capture = {};
  const session = { id: "session-approve" };
  const model = buildTransactionModel({
    result: { completedAt },
    capture,
  });

  await assert.rejects(
    ensureWeeklyGiftLimit({
      ownerId: "owner-1",
      receiverId: "receiver-1",
      session,
      now,
      transactionModel: model,
    }),
    (err) => {
      assert.equal(err.code, "GIFT_LIMIT_WEEKLY");
      return true;
    }
  );

  assert.equal(capture.session, session);
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
  const model = buildTransactionModel({
    result: { completedAt: boundaryCompletedAt },
    capture,
  });

  await ensureWeeklyGiftLimit({
    ownerId: "owner-1",
    receiverId: "receiver-1",
    now,
    transactionModel: model,
  });

  assert.equal(
    capture.filter.completedAt.$gt.toISOString(),
    getGiftLimitWindowStart(now).toISOString()
  );
});

test("concurrent gift-limit checks allow only one valid call when one call sees recent completion", async () => {
  const now = new Date("2026-02-19T12:00:00.000Z");
  const model = buildQueuedTransactionModel([
    null,
    { completedAt: new Date("2026-02-19T10:00:00.000Z") },
  ]);

  const results = await Promise.allSettled([
    ensureWeeklyGiftLimit({
      ownerId: "owner-1",
      receiverId: "receiver-1",
      now,
      transactionModel: model,
    }),
    ensureWeeklyGiftLimit({
      ownerId: "owner-1",
      receiverId: "receiver-1",
      now,
      transactionModel: model,
    }),
  ]);

  const fulfilledCount = results.filter((r) => r.status === "fulfilled").length;
  const rejected = results.find((r) => r.status === "rejected");

  assert.equal(fulfilledCount, 1);
  assert.ok(rejected);
  assert.equal(rejected.reason.code, "GIFT_LIMIT_WEEKLY");
});
