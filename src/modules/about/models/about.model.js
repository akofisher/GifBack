import mongoose from "mongoose";

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: "" },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
  },
  { _id: false }
);

const socialLinkSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, default: "", trim: true },
    url: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const extraFieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    value: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const aboutSchema = new mongoose.Schema(
  {
    key: { type: String, default: "ABOUT_US", index: true },
    title: { type: String, required: true, trim: true },
    subTitle: { type: String, default: "", trim: true },
    description: { type: String, required: true, trim: true },

    contactPhone1: { type: String, default: "", trim: true },
    contactPhone2: { type: String, default: "", trim: true },

    email1: { type: String, default: "", trim: true },
    email2: { type: String, default: "", trim: true },

    facebookLink: { type: String, default: "", trim: true },
    instagramLink: { type: String, default: "", trim: true },
    linkedinLink: { type: String, default: "", trim: true },
    tiktokLink: { type: String, default: "", trim: true },
    youtubeLink: { type: String, default: "", trim: true },

    socialLinks: { type: [socialLinkSchema], default: [] },
    extraFields: { type: [extraFieldSchema], default: [] },

    image: { type: imageSchema, default: null },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

aboutSchema.index({ key: 1, updatedAt: -1 });

export default mongoose.model("About", aboutSchema);
