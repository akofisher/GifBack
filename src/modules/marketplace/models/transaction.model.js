import mongoose from "mongoose";

const itemTransactionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["GIFT", "EXCHANGE"], required: true },
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: "ItemRequest", required: true, index: true },

    // Gift
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item", default: null },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },

    // Exchange
    itemAId: { type: mongoose.Schema.Types.ObjectId, ref: "Item", default: null },
    ownerAId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    itemBId: { type: mongoose.Schema.Types.ObjectId, ref: "Item", default: null },
    ownerBId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },

    completedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

itemTransactionSchema.index({ ownerId: 1, receiverId: 1, completedAt: -1 });
itemTransactionSchema.index({ ownerAId: 1, ownerBId: 1, completedAt: -1 });

export default mongoose.model("ItemTransaction", itemTransactionSchema);
