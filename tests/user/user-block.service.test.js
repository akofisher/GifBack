import assert from "node:assert/strict";
import test from "node:test";
import {
  USER_BLOCK_TYPES,
  USER_TEMPORARY_BLOCK_DAYS,
} from "../../src/modules/user/user-block.constants.js";
import {
  buildPublicUserBlockState,
  buildTemporaryBlockUntil,
  enforceUserAccessBlock,
} from "../../src/modules/user/services/user-block.service.js";

test("buildPublicUserBlockState returns NONE for active user", () => {
  const result = buildPublicUserBlockState({ isActive: true });
  assert.equal(result.isBlocked, false);
  assert.equal(result.blockType, USER_BLOCK_TYPES.NONE);
  assert.equal(result.blockedUntil, null);
});

test("buildPublicUserBlockState returns TEMPORARY_14_DAYS for active temporary block", () => {
  const now = new Date("2026-03-06T00:00:00.000Z");
  const blockedUntil = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const result = buildPublicUserBlockState(
    {
      isActive: false,
      accessBlock: {
        type: USER_BLOCK_TYPES.TEMPORARY_14_DAYS,
        until: blockedUntil,
      },
    },
    now
  );

  assert.equal(result.isBlocked, true);
  assert.equal(result.blockType, USER_BLOCK_TYPES.TEMPORARY_14_DAYS);
  assert.equal(result.blockedUntil?.toISOString(), blockedUntil.toISOString());
});

test("buildPublicUserBlockState normalizes expired temporary block to NONE", () => {
  const now = new Date("2026-03-06T00:00:00.000Z");
  const blockedUntil = new Date(now.getTime() - 1);

  const result = buildPublicUserBlockState(
    {
      isActive: false,
      accessBlock: {
        type: USER_BLOCK_TYPES.TEMPORARY_14_DAYS,
        until: blockedUntil,
      },
    },
    now
  );

  assert.equal(result.isBlocked, false);
  assert.equal(result.blockType, USER_BLOCK_TYPES.NONE);
  assert.equal(result.blockedUntil, null);
});

test("buildTemporaryBlockUntil uses 14-day duration", () => {
  const now = new Date("2026-03-06T00:00:00.000Z");
  const until = buildTemporaryBlockUntil(now);
  const days = (until.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
  assert.equal(days, USER_TEMPORARY_BLOCK_DAYS);
});

test("enforceUserAccessBlock throws USER_BLOCKED_TEMPORARY for active temporary block", async () => {
  const blockedUser = {
    isActive: false,
    accessBlock: {
      type: USER_BLOCK_TYPES.TEMPORARY_14_DAYS,
      until: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
    async save() {},
  };

  await assert.rejects(
    () => enforceUserAccessBlock(blockedUser),
    (err) => err?.code === "USER_BLOCKED_TEMPORARY"
  );
});

test("enforceUserAccessBlock auto-unblocks expired temporary block", async () => {
  let saved = false;
  const blockedUser = {
    isActive: false,
    accessBlock: {
      type: USER_BLOCK_TYPES.TEMPORARY_14_DAYS,
      until: new Date(Date.now() - 1000),
    },
    async save() {
      saved = true;
    },
  };

  await enforceUserAccessBlock(blockedUser);

  assert.equal(saved, true);
  assert.equal(blockedUser.isActive, true);
  assert.equal(blockedUser.accessBlock.type, USER_BLOCK_TYPES.NONE);
  assert.equal(blockedUser.accessBlock.until, null);
});

test("enforceUserAccessBlock treats legacy inactive users as permanently blocked", async () => {
  const blockedUser = {
    isActive: false,
    accessBlock: {
      type: USER_BLOCK_TYPES.NONE,
      until: null,
    },
    async save() {},
  };

  await assert.rejects(
    () => enforceUserAccessBlock(blockedUser),
    (err) => err?.code === "USER_BLOCKED_PERMANENT"
  );
});
