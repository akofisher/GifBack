import {
  createBlogByAdmin,
  deleteBlogByAdmin,
  getBlogForAdmin,
  getPublishedBlog,
  listBlogsForAdmin,
  listPublishedBlogs,
  updateBlogByAdmin,
} from "../services/blog.service.js";
import {
  adminCreateBlogSchema,
  adminListBlogsQuerySchema,
  adminUpdateBlogSchema,
  publicListBlogsQuerySchema,
} from "../validators/blog.validators.js";
import {
  buildWeakEtag,
  isRequestFresh,
  setCacheValidators,
} from "../../../utils/httpCache.js";

export const createAdminBlogHandler = async (req, res, next) => {
  try {
    const payload = adminCreateBlogSchema.parse(req.body);
    const blog = await createBlogByAdmin({ authorId: req.user.id, payload });
    res.status(201).json({ success: true, blog });
  } catch (err) {
    next(err);
  }
};

export const listAdminBlogsHandler = async (req, res, next) => {
  try {
    const query = adminListBlogsQuerySchema.parse(req.query || {});
    const result = await listBlogsForAdmin(query);
    res.status(200).json({
      success: true,
      data: {
        items: result.blogs,
        pagination: result.pagination,
      },
      ...result,
    });
  } catch (err) {
    next(err);
  }
};

export const getAdminBlogHandler = async (req, res, next) => {
  try {
    const blog = await getBlogForAdmin(req.params.id);
    res.status(200).json({ success: true, blog });
  } catch (err) {
    next(err);
  }
};

export const updateAdminBlogHandler = async (req, res, next) => {
  try {
    const payload = adminUpdateBlogSchema.parse(req.body);
    const blog = await updateBlogByAdmin({ blogId: req.params.id, payload });
    res.status(200).json({ success: true, blog });
  } catch (err) {
    next(err);
  }
};

export const deleteAdminBlogHandler = async (req, res, next) => {
  try {
    const result = await deleteBlogByAdmin(req.params.id);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

export const listBlogsHandler = async (req, res, next) => {
  try {
    const query = publicListBlogsQuerySchema.parse(req.query || {});
    const result = await listPublishedBlogs(query);
    const lastModified =
      result.blogs?.reduce((latest, blog) => {
        const candidate = blog?.updatedAt ? new Date(blog.updatedAt) : null;
        if (!candidate || Number.isNaN(candidate.getTime())) return latest;
        if (!latest || candidate > latest) return candidate;
        return latest;
      }, null) || null;
    const etag = buildWeakEtag({
      resource: "blogs",
      query,
      total: result.pagination?.total || 0,
      page: result.pagination?.page || 1,
      limit: result.pagination?.limit || 0,
      lastModified: lastModified?.toISOString?.() || null,
    });
    setCacheValidators(res, { etag, lastModified });
    if (isRequestFresh(req, { etag, lastModified })) {
      return res.status(304).end();
    }

    res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

export const getBlogHandler = async (req, res, next) => {
  try {
    const blog = await getPublishedBlog(req.params.id);
    res.status(200).json({ success: true, blog });
  } catch (err) {
    next(err);
  }
};
