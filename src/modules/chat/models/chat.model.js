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
  },
  { timestamps: true }
);

chatSchema.index({ participants: 1, status: 1, lastMessageAt: -1 });

export default mongoose.model("Chat", chatSchema);
