import assert from "node:assert/strict";
import test from "node:test";
import User from "../../src/modules/user/models/user.model.js";
import { getTopGivenLeaderboard } from "../../src/modules/user/services/user.service.js";

const mockFind = (rows) => {
  const originalFind = User.find;
  User.find = () => ({
    sort() {
      return this;
    },
    limit() {
      return this;
    },
    select() {
      return this;
    },
    lean: async () => rows,
  });

  return () => {
    User.find = originalFind;
  };
};

test("public leaderboard does not expose contact fields", async () => {
  const restore = mockFind([
    {
      _id: "65f100000000000000000001",
      firstName: "Ana",
      lastName: "K",
      email: "ana@example.com",
      phone: "+995500000001",
      stats: { given: 42, exchanged: 7 },
      avatar: { url: "https://example.com/a.png" },
    },
  ]);

  try {
    const result = await getTopGivenLeaderboard(10);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].user.name, "Ana K");
    assert.equal("email" in result.items[0].user, false);
    assert.equal("phoneNumber" in result.items[0].user, false);
  } finally {
    restore();
  }
});

test("admin leaderboard includes email and phoneNumber", async () => {
  const restore = mockFind([
    {
      _id: "65f100000000000000000002",
      firstName: "Nino",
      lastName: "B",
      email: "nino@example.com",
      phone: "+995500000002",
      stats: { given: 11, exchanged: 2 },
      avatar: { url: "https://example.com/n.png" },
    },
  ]);

  try {
    const result = await getTopGivenLeaderboard(10, { includeContacts: true });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].user.email, "nino@example.com");
    assert.equal(result.items[0].user.phoneNumber, "+995500000002");
  } finally {
    restore();
  }
});

test("leaderboard returns empty list when there are no users", async () => {
  const restore = mockFind([]);

  try {
    const result = await getTopGivenLeaderboard(10, { includeContacts: true });
    assert.equal(result.items.length, 0);
    assert.equal(result.pagination.page, 1);
    assert.equal(result.pagination.limit, 10);
    assert.equal(result.pagination.total, 0);
    assert.equal(result.pagination.pages, 1);
  } finally {
    restore();
  }
});
