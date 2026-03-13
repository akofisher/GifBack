import mongoose from "mongoose";

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    link: { type: String, default: "", trim: true },
    path: { type: String, default: "" },
    filename: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    size: { type: Number, default: null },
    provider: { type: String, default: "local" },
    publicId: { type: String, default: "" },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
  },
  { _id: false }
);

const blogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    titleTranslations: { type: Map, of: String, default: {} },
    slug: { type: String, required: true, trim: true, unique: true, index: true },
    summary: { type: String, trim: true, default: "" },
    summaryTranslations: { type: Map, of: String, default: {} },
    content: { type: String, required: true, trim: true },
    contentTranslations: { type: Map, of: String, default: {} },
    link: { type: String, default: "", trim: true },
    images: { type: [imageSchema], default: [] },
    coverImage: { type: imageSchema, default: null },
    tags: { type: [String], default: [] },
    isPublished: { type: Boolean, default: true, index: true },
    publishedAt: { type: Date, default: null, index: true },
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

blogSchema.index({ isPublished: 1, publishedAt: -1, createdAt: -1 });
blogSchema.index({ createdAt: -1 });
blogSchema.index({ updatedAt: -1 });
blogSchema.index({ title: "text", slug: "text", summary: "text", content: "text" });

export default mongoose.model("Blog", blogSchema);
