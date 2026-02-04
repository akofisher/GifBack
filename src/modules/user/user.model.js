import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },

    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    phone: { type: String, trim: true },

    password: { type: String, required: true, select: false },

    role: { type: String, default: "user" },
    isActive: { type: Boolean, default: true },

    avatar: {
      url: { type: String, default: "https://i.pravatar.cc/300" },
      base64: { type: String, default: "" },
    },

   dateOfBirth: { type: Date, default: "" },

    stats: {
      giving: { type: Number, default: 0 },
      exchanging: { type: Number, default: 0 },
      exchanged: { type: Number, default: 0 },
      given: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
