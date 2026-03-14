import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import {
  applyAutoCanceledVisibilityFilter,
  buildCompetingRequestConflictMatch,
  deriveGiftPolicyOwnerState,
  formatRequestWithUsers,
  isDuplicateActiveRequestMongoError,
  resolveViewerRequestState,
} from "../../src/modules/marketplace/services/marketplace.service.js";

test("resolveViewerRequestState returns null availability for anonymous viewer", () => {
  const result = resolveViewerRequestState({
    viewerId: null,
    itemStatus: "ACTIVE",
    itemOwnerId: new mongoose.Types.ObjectId(),
    myRequestStatus: null,
  });

  assert.equal(result.canCreateRequest, null);
  assert.equal(result.requestBlockReason, null);
});

test("resolveViewerRequestState blocks by stable reasons", () => {
  const viewerId = new mongoose.Types.ObjectId();
  const ownerId = new mongoose.Types.ObjectId();

  const inactive = resolveViewerRequestState({
    viewerId,
    itemStatus: "RESERVED",
    itemOwnerId: ownerId,
    myRequestStatus: null,
  });
  assert.equal(inactive.canCreateRequest, false);
  assert.equal(inactive.requestBlockReason, "ITEM_NOT_ACTIVE");

  const ownerBlocked = resolveViewerRequestState({
    viewerId,
    itemStatus: "ACTIVE",
    itemOwnerId: viewerId,
    myRequestStatus: null,
  });
  assert.equal(ownerBlocked.canCreateRequest, false);
  assert.equal(ownerBlocked.requestBlockReason, "OWNER_ITEM");

  const pendingBlocked = resolveViewerRequestState({
    viewerId,
    itemStatus: "ACTIVE",
    itemOwnerId: ownerId,
    myRequestStatus: "PENDING",
  });
  assert.equal(pendingBlocked.canCreateRequest, false);
  assert.equal(pendingBlocked.requestBlockReason, "ALREADY_IN_PROCESS");

  const policyBlocked = resolveViewerRequestState({
    viewerId,
    itemStatus: "ACTIVE",
    itemOwnerId: ownerId,
    myRequestStatus: null,
    blockedByPolicy: true,
  });
  assert.equal(policyBlocked.canCreateRequest, false);
  assert.equal(policyBlocked.requestBlockReason, "BLOCKED_BY_POLICY");
});

test("resolveViewerRequestState allows request when no blockers apply", () => {
  const result = resolveViewerRequestState({
    viewerId: new mongoose.Types.ObjectId(),
    itemStatus: "ACTIVE",
    itemOwnerId: new mongoose.Types.ObjectId(),
    myRequestStatus: "REJECTED",
    blockedByPolicy: false,
  });

  assert.equal(result.canCreateRequest, true);
  assert.equal(result.requestBlockReason, null);
});

test("isDuplicateActiveRequestMongoError detects unique duplicate key variants", () => {
  assert.equal(
    isDuplicateActiveRequestMongoError({
      code: 11000,
      keyPattern: { requesterId: 1, itemId: 1 },
    }),
    true
  );

  assert.equal(
    isDuplicateActiveRequestMongoError({
      code: 11000,
      keyValue: { requesterId: "u1", itemId: "i1" },
    }),
    true
  );

  assert.equal(
    isDuplicateActiveRequestMongoError({
      code: 11000,
      message: "E11000 duplicate key error index: requesterId_1_itemId_1",
    }),
    true
  );

  assert.equal(
    isDuplicateActiveRequestMongoError({
      code: 11000,
      keyPattern: { email: 1 },
    }),
    false
  );
});

test("buildCompetingRequestConflictMatch matches both target and offered conflicts", () => {
  const approvedRequestId = new mongoose.Types.ObjectId();
  const reservedObjectIds = [
    new mongoose.Types.ObjectId(),
    new mongoose.Types.ObjectId(),
  ];

  const match = buildCompetingRequestConflictMatch({
    approvedRequestId,
    reservedObjectIds,
  });

  assert.equal(match.status, "PENDING");
  assert.equal(match._id.$ne.toString(), approvedRequestId.toString());
  assert.deepEqual(match.$or[0], { itemId: { $in: reservedObjectIds } });
  assert.deepEqual(match.$or[1], { offeredItemId: { $in: reservedObjectIds } });
});

test("formatRequestWithUsers propagates cancellationReason", () => {
  const ownerId = new mongoose.Types.ObjectId();
  const requesterId = new mongoose.Types.ObjectId();
  const itemId = new mongoose.Types.ObjectId();

  const formatted = formatRequestWithUsers({
    _id: new mongoose.Types.ObjectId(),
    ownerId: {
      _id: ownerId,
      firstName: "Owner",
      lastName: "User",
    },
    requesterId: {
      _id: requesterId,
      firstName: "Requester",
      lastName: "User",
    },
    itemId: {
      _id: itemId,
      title: "Item",
      description: "desc",
      images: [{ url: "https://example.com/a.jpg" }],
      mode: "GIFT",
      status: "ACTIVE",
      categoryId: null,
      ownerId,
      countryId: null,
      cityId: null,
      address: "",
    },
    offeredItemId: null,
    itemSnapshot: { title: "Item", imageUrl: "https://example.com/a.jpg" },
    offeredItemSnapshot: { title: "", imageUrl: "" },
    cancellationReason: "AUTO_CANCELED_CONFLICT",
  });

  assert.equal(formatted.cancellationReason, "AUTO_CANCELED_CONFLICT");
});

test("formatRequestWithUsers resolves viewer unread flags", () => {
  const ownerId = new mongoose.Types.ObjectId();
  const requesterId = new mongoose.Types.ObjectId();
  const now = new Date("2026-03-14T12:00:00.000Z");

  const ownerView = formatRequestWithUsers(
    {
      _id: new mongoose.Types.ObjectId(),
      ownerId,
      requesterId,
      ownerSeenAt: now,
      requesterSeenAt: null,
      itemId: new mongoose.Types.ObjectId(),
    },
    { viewerId: ownerId }
  );
  assert.equal(ownerView.viewerSeen, true);
  assert.equal(ownerView.viewerUnread, false);

  const requesterView = formatRequestWithUsers(
    {
      _id: new mongoose.Types.ObjectId(),
      ownerId,
      requesterId,
      ownerSeenAt: now,
      requesterSeenAt: null,
      itemId: new mongoose.Types.ObjectId(),
    },
    { viewerId: requesterId }
  );
  assert.equal(requesterView.viewerSeen, false);
  assert.equal(requesterView.viewerUnread, true);
});

test("formatRequestWithUsers treats legacy missing seen fields as already seen", () => {
  const ownerId = new mongoose.Types.ObjectId();
  const requesterId = new mongoose.Types.ObjectId();
  const updatedAt = new Date("2026-03-14T15:00:00.000Z");

  const ownerView = formatRequestWithUsers(
    {
      _id: new mongoose.Types.ObjectId(),
      ownerId,
      requesterId,
      itemId: new mongoose.Types.ObjectId(),
      createdAt: new Date("2026-03-10T10:00:00.000Z"),
      updatedAt,
    },
    { viewerId: ownerId }
  );

  const requesterView = formatRequestWithUsers(
    {
      _id: new mongoose.Types.ObjectId(),
      ownerId,
      requesterId,
      itemId: new mongoose.Types.ObjectId(),
      createdAt: new Date("2026-03-10T10:00:00.000Z"),
      updatedAt,
    },
    { viewerId: requesterId }
  );

  assert.equal(ownerView.viewerSeen, true);
  assert.equal(ownerView.viewerUnread, false);
  assert.equal(requesterView.viewerSeen, true);
  assert.equal(requesterView.viewerUnread, false);
});

test("applyAutoCanceledVisibilityFilter hides auto-canceled by default", () => {
  const filtered = applyAutoCanceledVisibilityFilter(
    { requesterId: new mongoose.Types.ObjectId() },
    {}
  );

  assert.equal(
    filtered.cancellationReason?.$ne,
    "AUTO_CANCELED_CONFLICT"
  );
});

test("applyAutoCanceledVisibilityFilter keeps all rows when includeAutoCanceled=true", () => {
  const baseFilter = { ownerId: new mongoose.Types.ObjectId() };
  const filtered = applyAutoCanceledVisibilityFilter(baseFilter, {
    includeAutoCanceled: true,
  });

  assert.equal(filtered, baseFilter);
  assert.equal(filtered.cancellationReason, undefined);
});

test("deriveGiftPolicyOwnerState does not block after single completed gift", () => {
  const now = new Date("2026-02-27T12:00:00.000Z");
  const ownerId = new mongoose.Types.ObjectId().toString();
  const state = deriveGiftPolicyOwnerState({
    now,
    transactionRows: [
      {
        _id: new mongoose.Types.ObjectId(),
        ownerId,
        requestId: new mongoose.Types.ObjectId(),
        completedAt: new Date("2026-02-26T12:00:00.000Z"),
      },
    ],
    requestRows: [],
    limit: 2,
  });

  assert.equal(state.get(ownerId)?.count, 1);
  assert.equal(state.get(ownerId)?.blocked, false);
  assert.equal(state.get(ownerId)?.retryAt, null);
});

test("deriveGiftPolicyOwnerState blocks on second gift in window", () => {
  const now = new Date("2026-02-27T12:00:00.000Z");
  const ownerId = new mongoose.Types.ObjectId().toString();
  const requestId = new mongoose.Types.ObjectId();
  const state = deriveGiftPolicyOwnerState({
    now,
    transactionRows: [
      {
        _id: new mongoose.Types.ObjectId(),
        ownerId,
        requestId,
        completedAt: new Date("2026-02-25T12:00:00.000Z"),
      },
      {
        _id: new mongoose.Types.ObjectId(),
        ownerId,
        requestId: new mongoose.Types.ObjectId(),
        completedAt: new Date("2026-02-26T12:00:00.000Z"),
      },
    ],
    requestRows: [
      // duplicate of same completion via request source should not inflate count
      {
        _id: requestId,
        ownerId,
        completedAt: new Date("2026-02-25T12:00:00.000Z"),
      },
    ],
    limit: 2,
  });

  assert.equal(state.get(ownerId)?.count, 2);
  assert.equal(state.get(ownerId)?.blocked, true);
  assert.ok(state.get(ownerId)?.retryAt instanceof Date);
});
