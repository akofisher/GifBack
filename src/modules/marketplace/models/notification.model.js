import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: [
        "REQUEST_CREATED",
        "REQUEST_APPROVED",
        "REQUEST_REJECTED",
        "CONFIRM_NEEDED",
        "COMPLETED",
        "EXPIRED",
        "CANCELED",
      ],
      required: true,
    },

    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: "ItemRequest", default: null },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item", default: null },
    offeredItemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item", default: null },

    data: { type: Object, default: {} },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("Notification", notificationSchema);
