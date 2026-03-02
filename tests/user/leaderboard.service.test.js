import assert from "node:assert/strict";
import test from "node:test";
import User from "../../src/modules/user/models/user.model.js";
import ItemRequest from "../../src/modules/marketplace/models/request.model.js";
import ItemTransaction from "../../src/modules/marketplace/models/transaction.model.js";
import { getTopGivenLeaderboard } from "../../src/modules/user/services/user.service.js";

const mockLeaderboardSources = ({ giftRows = [], exchangeRows = [], users = [] }) => {
  const originalFind = User.find;
  const originalRequestAggregate = ItemRequest.aggregate;
  const originalAggregate = ItemTransaction.aggregate;

  User.find = () => {
    const query = {
      select() {
        return query;
      },
      lean: async () => users,
    };
    return query;
  };

  ItemTransaction.aggregate = async (pipeline) => {
    const matchStage = pipeline.find((stage) => stage.$match)?.$match || {};
    if (matchStage.type === "GIFT") {
      return giftRows;
    }
    if (matchStage.type === "EXCHANGE") {
      return exchangeRows;
    }
    return [];
  };

  ItemRequest.aggregate = async (pipeline) => {
    const matchStage = pipeline.find((stage) => stage.$match)?.$match || {};
    if (matchStage.type === "GIFT") {
      return giftRows;
    }
    if (matchStage.type === "EXCHANGE") {
      return exchangeRows;
    }
    return [];
  };

  return () => {
    User.find = originalFind;
    ItemRequest.aggregate = originalRequestAggregate;
    ItemTransaction.aggregate = originalAggregate;
  };
};

test("public leaderboard does not expose contact fields", async () => {
  const restore = mockLeaderboardSources({
    giftRows: [{ _id: "65f100000000000000000001", given: 42 }],
    exchangeRows: [{ _id: "65f100000000000000000001", exchanged: 7 }],
    users: [
      {
        _id: "65f100000000000000000001",
        firstName: "Ana",
        lastName: "K",
        email: "ana@example.com",
        phone: "+995500000001",
        avatar: { url: "https://example.com/a.png" },
      },
    ],
  });

  try {
    const result = await getTopGivenLeaderboard(10);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].user.name, "Ana K");
    assert.equal(result.items[0].stats.given, 42);
    assert.equal(result.items[0].stats.exchanged, 7);
    assert.equal("email" in result.items[0].user, false);
    assert.equal("phoneNumber" in result.items[0].user, false);
  } finally {
    restore();
  }
});

test("admin leaderboard includes email and phoneNumber", async () => {
  const restore = mockLeaderboardSources({
    giftRows: [{ _id: "65f100000000000000000002", given: 11 }],
    exchangeRows: [{ _id: "65f100000000000000000002", exchanged: 2 }],
    users: [
      {
        _id: "65f100000000000000000002",
        firstName: "Nino",
        lastName: "B",
        email: "nino@example.com",
        phone: "+995500000002",
        avatar: { url: "https://example.com/n.png" },
      },
    ],
  });

  try {
    const result = await getTopGivenLeaderboard(10, { includeContacts: true });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].user.email, "nino@example.com");
    assert.equal(result.items[0].user.phoneNumber, "+995500000002");
    assert.equal(result.items[0].stats.given, 11);
    assert.equal(result.items[0].stats.exchanged, 2);
  } finally {
    restore();
  }
});

test("leaderboard returns empty list when there are no users", async () => {
  const restore = mockLeaderboardSources({
    giftRows: [],
    exchangeRows: [],
    users: [],
  });

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
