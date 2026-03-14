import mongoose from "mongoose";

const itemRequestSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["GIFT", "EXCHANGE"], required: true },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "CANCELED", "EXPIRED", "COMPLETED"],
      default: "PENDING",
      index: true,
    },

    itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: true, index: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    requesterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    offeredItemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item", default: null },
    offeredOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    message: { type: String, trim: true, default: "" },

    cancellationReason: {
      type: String,
      enum: ["AUTO_CANCELED_CONFLICT"],
      default: null,
    },

    itemSnapshot: {
      title: { type: String, default: "" },
      imageUrl: { type: String, default: "" },
    },
    offeredItemSnapshot: {
      title: { type: String, default: "" },
      imageUrl: { type: String, default: "" },
    },

    chatId: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", default: null },

    approvedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },

    ownerConfirmedAt: { type: Date, default: null },
    requesterConfirmedAt: { type: Date, default: null },
    ownerSeenAt: { type: Date, default: null },
    requesterSeenAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    respondedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

itemRequestSchema.index({ itemId: 1, status: 1 });
itemRequestSchema.index({ status: 1, itemId: 1 });
itemRequestSchema.index({ status: 1, offeredItemId: 1 });
itemRequestSchema.index({ requesterId: 1, itemId: 1, status: 1 });
itemRequestSchema.index(
  { requesterId: 1, itemId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["PENDING", "APPROVED"] } },
  }
);
itemRequestSchema.index({ ownerId: 1, status: 1, createdAt: -1 });
itemRequestSchema.index({ requesterId: 1, status: 1, createdAt: -1 });
itemRequestSchema.index({ ownerId: 1, ownerSeenAt: 1, createdAt: -1 });
itemRequestSchema.index({ requesterId: 1, requesterSeenAt: 1, createdAt: -1 });

export default mongoose.model("ItemRequest", itemRequestSchema);
