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
    labelTranslations: { type: Map, of: String, default: {} },
    url: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const extraFieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    keyTranslations: { type: Map, of: String, default: {} },
    value: { type: String, default: "", trim: true },
    valueTranslations: { type: Map, of: String, default: {} },
  },
  { _id: false }
);

const aboutSchema = new mongoose.Schema(
  {
    key: { type: String, default: "ABOUT_US", index: true },
    title: { type: String, required: true, trim: true },
    titleTranslations: { type: Map, of: String, default: {} },
    subTitle: { type: String, default: "", trim: true },
    subTitleTranslations: { type: Map, of: String, default: {} },
    description: { type: String, required: true, trim: true },
    descriptionTranslations: { type: Map, of: String, default: {} },

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
