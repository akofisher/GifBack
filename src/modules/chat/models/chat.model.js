import mongoose from "mongoose";

const chatSchema = new mongoose.Schema(
  {
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ItemRequest",
      required: true,
      unique: true,
      index: true,
    },
    participants: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      required: true,
    },
    status: { type: String, enum: ["OPEN", "CLOSED"], default: "OPEN" },
    lastMessageAt: { type: Date, default: null },
    lastMessageText: { type: String, default: "" },
    readState: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        unreadCount: { type: Number, default: 0 },
        lastReadAt: { type: Date, default: null },
      },
    ],
  },
  { timestamps: true }
);

chatSchema.index({ participants: 1, status: 1, lastMessageAt: -1 });
chatSchema.index({ "readState.userId": 1, status: 1, updatedAt: -1 });

export default mongoose.model("Chat", chatSchema);
