import mongoose from "mongoose";

export const MARKETPLACE_EVENT_TYPES = Object.freeze([
  "ITEM_CREATED",
  "ITEM_DELETED",
  "REQUEST_CREATED",
  "REQUEST_APPROVED",
  "REQUEST_REJECTED",
  "REQUEST_CANCELED",
  "REQUEST_EXPIRED",
  "REQUEST_COMPLETED",
  "REQUEST_AUTO_CANCELED_CONFLICT",
]);

const marketplaceEventSchema = new mongoose.Schema(
  {
    type: { type: String, enum: MARKETPLACE_EVENT_TYPES, required: true, index: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: "ItemRequest", default: null, index: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item", default: null, index: true },
    offeredItemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item", default: null, index: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    requesterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

marketplaceEventSchema.index({ type: 1, createdAt: -1 });
marketplaceEventSchema.index({ createdAt: -1 });
marketplaceEventSchema.index({ requestId: 1, createdAt: -1 });
marketplaceEventSchema.index({ itemId: 1, createdAt: -1 });
marketplaceEventSchema.index({ actorId: 1, createdAt: -1 });

export default mongoose.model("MarketplaceEvent", marketplaceEventSchema);
