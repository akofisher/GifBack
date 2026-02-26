import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import {
  buildCompetingRequestConflictMatch,
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
