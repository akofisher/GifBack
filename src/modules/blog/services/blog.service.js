import mongoose from "mongoose";
import { badRequest, notFound } from "../../../utils/appError.js";
import Blog from "../models/blog.model.js";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const slugify = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);

const buildAdminSort = (sort) => {
  if (sort === "createdAt_asc") return { createdAt: 1, _id: 1 };
  if (sort === "updatedAt_desc") return { updatedAt: -1, _id: -1 };
  if (sort === "updatedAt_asc") return { updatedAt: 1, _id: 1 };
  return { createdAt: -1, _id: -1 };
};

const buildPublicSort = (sort) =>
  sort === "publishedAt_asc"
    ? { publishedAt: 1, createdAt: 1, _id: 1 }
    : { publishedAt: -1, createdAt: -1, _id: -1 };

const buildPagination = ({ page = 1, limit = 20, total = 0 }) => ({
  page,
  limit,
  total,
  pages: Math.max(1, Math.ceil(total / limit)),
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

const buildName = (firstName, lastName) =>
  [firstName, lastName].filter(Boolean).join(" ").trim();

const normalizeImages = ({ images, coverImage }) => {
  if (Array.isArray(images) && images.length) {
    return {
      images,
      coverImage: images[0],
    };
  }

  if (coverImage) {
    return {
      images: [coverImage],
      coverImage,
    };
  }

  return {
    images: [],
    coverImage: null,
  };
};

const hasNonEmptyLink = (value) =>
  typeof value === "string" && value.trim().length > 0;

const hasAnyImage = ({ images, coverImage }) =>
  (Array.isArray(images) && images.length > 0) || Boolean(coverImage?.url);

const ensureBlogHasRenderableMedia = ({ link, images, coverImage }) => {
  if (hasNonEmptyLink(link) || hasAnyImage({ images, coverImage })) return;

  throw badRequest("Validation error", "VALIDATION_ERROR", [
    {
      field: "link",
      message: "Provide either link or at least one image",
    },
  ]);
};

const formatBlog = (blog) => {
  if (!blog) return null;
  const author =
    blog.authorId && typeof blog.authorId === "object" ? blog.authorId : null;
  const authorName = author ? buildName(author.firstName, author.lastName) : "";
  const images =
    Array.isArray(blog.images) && blog.images.length
      ? blog.images
      : blog.coverImage
        ? [blog.coverImage]
        : [];
  const coverImage = blog.coverImage || images[0] || null;

  return {
    ...blog,
    images,
    coverImage,
    authorId: author?._id?.toString?.() || blog.authorId || null,
    author: author
      ? {
          id: author._id?.toString?.() || "",
          firstName: author.firstName || "",
          lastName: author.lastName || "",
          name: authorName,
        }
      : null,
    authorName,
  };
};

const findBlogForAdmin = async (id) => {
  const blog = await Blog.findById(id)
    .populate({ path: "authorId", select: "firstName lastName" })
    .lean();
  if (!blog) throw notFound("Blog not found", "BLOG_NOT_FOUND");
  return formatBlog(blog);
};

const findPublishedBlog = async (idOrSlug) => {
  let filter;
  if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
    filter = { _id: idOrSlug, isPublished: true };
  } else {
    filter = { slug: idOrSlug, isPublished: true };
  }

  const blog = await Blog.findOne(filter)
    .populate({ path: "authorId", select: "firstName lastName" })
    .lean();
  if (!blog) throw notFound("Blog not found", "BLOG_NOT_FOUND");
  return formatBlog(blog);
};

const ensureUniqueSlug = async ({ title, requestedSlug, excludeId = null }) => {
  const base = slugify(requestedSlug || title || "") || `blog-${Date.now()}`;
  let candidate = base;
  let i = 1;

  while (true) {
    const existing = await Blog.findOne({
      slug: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    })
      .select("_id")
      .lean();

    if (!existing) return candidate;
    candidate = `${base}-${i++}`;
  }
};

export const createBlogByAdmin = async ({ authorId, payload }) => {
  const slug = await ensureUniqueSlug({
    title: payload.title,
    requestedSlug: payload.slug,
  });

  const normalizedImages = normalizeImages({
    images: payload.images,
    coverImage: payload.coverImage,
  });
  ensureBlogHasRenderableMedia({
    link: payload.link,
    images: normalizedImages.images,
    coverImage: normalizedImages.coverImage,
  });

  const now = new Date();
  const [created] = await Blog.create([
    {
      title: payload.title.trim(),
      slug,
      summary: payload.summary?.trim() || "",
      content: payload.content.trim(),
      link: payload.link || "",
      images: normalizedImages.images,
      coverImage: normalizedImages.coverImage,
      tags: payload.tags || [],
      isPublished: payload.isPublished ?? true,
      publishedAt: payload.isPublished === false ? null : now,
      authorId,
    },
  ]);

  return findBlogForAdmin(created._id);
};

export const listBlogsForAdmin = async (query) => {
  const filter = {};
  if (typeof query.isPublished === "boolean") filter.isPublished = query.isPublished;
  if (query.search) {
    const regex = new RegExp(escapeRegex(query.search), "i");
    filter.$or = [{ title: regex }, { slug: regex }, { summary: regex }, { content: regex }];
  }

  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const skip = (page - 1) * limit;
  const sort = buildAdminSort(query.sort);

  const [rows, total] = await Promise.all([
    Blog.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate({ path: "authorId", select: "firstName lastName" })
      .lean(),
    Blog.countDocuments(filter),
  ]);

  return {
    blogs: rows.map(formatBlog),
    pagination: buildPagination({ page, limit, total }),
  };
};

export const getBlogForAdmin = async (blogId) => {
  return findBlogForAdmin(blogId);
};

export const updateBlogByAdmin = async ({ blogId, payload }) => {
  const blog = await Blog.findById(blogId);
  if (!blog) throw notFound("Blog not found", "BLOG_NOT_FOUND");

  if (payload.title !== undefined) blog.title = payload.title.trim();
  if (payload.summary !== undefined) blog.summary = payload.summary.trim();
  if (payload.content !== undefined) blog.content = payload.content.trim();
  if (payload.link !== undefined) blog.link = payload.link;
  if (payload.images !== undefined || payload.coverImage !== undefined) {
    const normalizedImages = normalizeImages({
      images: payload.images !== undefined ? payload.images : blog.images,
      coverImage:
        payload.coverImage !== undefined ? payload.coverImage : blog.coverImage,
    });
    blog.images = normalizedImages.images;
    blog.coverImage = normalizedImages.coverImage;
  }
  ensureBlogHasRenderableMedia({
    link: blog.link,
    images: blog.images,
    coverImage: blog.coverImage,
  });
  if (payload.tags !== undefined) blog.tags = payload.tags;

  if (payload.title !== undefined || payload.slug !== undefined) {
    blog.slug = await ensureUniqueSlug({
      title: payload.title ?? blog.title,
      requestedSlug: payload.slug,
      excludeId: blog._id,
    });
  }

  if (payload.isPublished !== undefined) {
    blog.isPublished = payload.isPublished;
    if (payload.isPublished && !blog.publishedAt) {
      blog.publishedAt = new Date();
    }
    if (!payload.isPublished) {
      blog.publishedAt = null;
    }
  }

  await blog.save();
  return findBlogForAdmin(blog._id);
};

export const deleteBlogByAdmin = async (blogId) => {
  const blog = await Blog.findById(blogId).select("_id");
  if (!blog) throw notFound("Blog not found", "BLOG_NOT_FOUND");

  await Blog.deleteOne({ _id: blog._id });
  return { deleted: true, id: blog._id.toString() };
};

export const listPublishedBlogs = async (query) => {
  const filter = { isPublished: true };
  if (query.search) {
    const regex = new RegExp(escapeRegex(query.search), "i");
    filter.$or = [{ title: regex }, { slug: regex }, { summary: regex }, { content: regex }];
  }

  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const skip = (page - 1) * limit;
  const sort = buildPublicSort(query.sort);

  const [rows, total] = await Promise.all([
    Blog.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate({ path: "authorId", select: "firstName lastName" })
      .lean(),
    Blog.countDocuments(filter),
  ]);

  return {
    blogs: rows.map(formatBlog),
    pagination: buildPagination({ page, limit, total }),
  };
};

export const getPublishedBlog = async (idOrSlug) => {
  return findPublishedBlog(idOrSlug);
};
