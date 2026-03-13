import {
  cancelRequest,
  deleteRequest,
  hardDeleteRequest,
  confirmRequest,
  createItem,
  createRequest,
  deleteItem,
  getActiveItems,
  getHistory,
  getIncomingRequests,
  getItemById,
  getMyItems,
  getMyRequests,
  getRequestDetails,
  listCategories,
  listLocations,
  respondToRequest,
  updateItem,
} from "../services/marketplace.service.js";
import {
  createItemSchema,
  createRequestSchema,
  historyQuerySchema,
  listItemsQuerySchema,
  listMyItemsQuerySchema,
  listRequestsQuerySchema,
  respondSchema,
  updateItemSchema,
} from "../validators/marketplace.validators.js";
import {
  buildWeakEtag,
  isRequestFresh,
  setCacheValidators,
} from "../../../utils/httpCache.js";
import { sendRequestLifecyclePushSafe } from "../../push/services/push.service.js";

export const listCategoriesHandler = async (req, res, next) => {
  try {
    const categories = await listCategories(req.locale);
    res.vary("Accept-Language");
    res.vary("X-Language");
    res.vary("X-Lang");
    const lastModified = categories.reduce((latest, category) => {
      const candidate = category?.updatedAt ? new Date(category.updatedAt) : null;
      if (!candidate || Number.isNaN(candidate.getTime())) return latest;
      if (!latest || candidate > latest) return candidate;
      return latest;
    }, null);
    const etag = buildWeakEtag({
      resource: "categories",
      locale: req.locale,
      total: categories.length,
      lastModified: lastModified?.toISOString?.() || null,
    });
    setCacheValidators(res, { etag, lastModified });
    if (isRequestFresh(req, { etag, lastModified })) {
      return res.status(304).end();
    }

    res.status(200).json({ success: true, categories });
  } catch (err) {
    next(err);
  }
};

export const listLocationsHandler = async (req, res, next) => {
  try {
    const countries = await listLocations(req.locale);
    res.vary("Accept-Language");
    res.vary("X-Language");
    res.vary("X-Lang");
    const lastModified = countries.reduce((latest, country) => {
      const candidate = country?.updatedAt ? new Date(country.updatedAt) : null;
      if (!candidate || Number.isNaN(candidate.getTime())) return latest;
      if (!latest || candidate > latest) return candidate;
      return latest;
    }, null);
    const etag = buildWeakEtag({
      resource: "locations",
      locale: req.locale,
      total: countries.length,
      lastModified: lastModified?.toISOString?.() || null,
    });
    setCacheValidators(res, { etag, lastModified });
    if (isRequestFresh(req, { etag, lastModified })) {
      return res.status(304).end();
    }

    res.status(200).json({ success: true, countries });
  } catch (err) {
    next(err);
  }
};

export const createItemHandler = async (req, res, next) => {
  try {
    const data = createItemSchema.parse(req.body);
    const item = await createItem(req.user.id, data);
    res.status(201).json({ success: true, item });
  } catch (err) {
    next(err);
  }
};

export const listItemsHandler = async (req, res, next) => {
  try {
    const query = listItemsQuerySchema.parse(req.query || {});
    const result = await getActiveItems(query, req.user?.id || null);

    if (!req.user?.id) {
      const lastModified =
        result.items.reduce((latest, item) => {
          const candidate = item?.updatedAt ? new Date(item.updatedAt) : null;
          if (!candidate || Number.isNaN(candidate.getTime())) return latest;
          if (!latest || candidate > latest) return candidate;
          return latest;
        }, null) || null;
      const etag = buildWeakEtag({
        resource: "items",
        query,
        total: result.pagination.total,
        page: result.pagination.page,
        limit: result.pagination.limit,
        lastModified: lastModified?.toISOString?.() || null,
      });
      setCacheValidators(res, { etag, lastModified });
      if (isRequestFresh(req, { etag, lastModified })) {
        return res.status(304).end();
      }
    }

    res.status(200).json({
      success: true,
      data: result.items,
      pagination: result.pagination,
      items: result.items,
    });
  } catch (err) {
    next(err);
  }
};

export const getItemHandler = async (req, res, next) => {
  try {
    const item = await getItemById(req.params.id, req.user?.id || null);
    res.status(200).json({ success: true, item });
  } catch (err) {
    next(err);
  }
};

export const listMyItemsHandler = async (req, res, next) => {
  try {
    const query = listMyItemsQuerySchema.parse(req.query || {});
    const result = await getMyItems(req.user.id, query);
    res.status(200).json({
      success: true,
      data: result.items,
      pagination: result.pagination,
      items: result.items,
    });
  } catch (err) {
    next(err);
  }
};

export const updateItemHandler = async (req, res, next) => {
  try {
    const data = updateItemSchema.parse(req.body);
    const item = await updateItem(req.user.id, req.params.id, data);
    res.status(200).json({ success: true, item });
  } catch (err) {
    next(err);
  }
};

export const deleteItemHandler = async (req, res, next) => {
  try {
    const item = await deleteItem(req.user.id, req.params.id);
    res.status(200).json({ success: true, item });
  } catch (err) {
    next(err);
  }
};

export const createRequestHandler = async (req, res, next) => {
  try {
    const data = createRequestSchema.parse(req.body);
    const request = await createRequest(req.user.id, req.params.itemId, data);
    await sendRequestLifecyclePushSafe({
      event: "REQUEST_CREATED",
      request,
      actorId: req.user.id,
    });
    res.status(201).json({ success: true, request });
  } catch (err) {
    next(err);
  }
};

export const listMyRequestsHandler = async (req, res, next) => {
  try {
    const query = listRequestsQuerySchema.parse(req.query || {});
    const result = await getMyRequests(req.user.id, query);
    res.status(200).json({
      success: true,
      data: result.requests,
      pagination: result.pagination,
      requests: result.requests,
    });
  } catch (err) {
    next(err);
  }
};

export const listIncomingRequestsHandler = async (req, res, next) => {
  try {
    const query = listRequestsQuerySchema.parse(req.query || {});
    const result = await getIncomingRequests(req.user.id, query);
    res.status(200).json({
      success: true,
      data: result.requests,
      pagination: result.pagination,
      requests: result.requests,
    });
  } catch (err) {
    next(err);
  }
};

export const getRequestHandler = async (req, res, next) => {
  try {
    const request = await getRequestDetails(req.user.id, req.params.id);
    res.status(200).json({ success: true, request });
  } catch (err) {
    next(err);
  }
};

export const respondRequestHandler = async (req, res, next) => {
  try {
    const data = respondSchema.parse(req.body);
    const request = await respondToRequest(req.user.id, req.params.id, data.action);
    await sendRequestLifecyclePushSafe({
      event: request.status === "APPROVED" ? "REQUEST_APPROVED" : "REQUEST_REJECTED",
      request,
      actorId: req.user.id,
    });
    res.status(200).json({ success: true, request });
  } catch (err) {
    next(err);
  }
};

export const confirmRequestHandler = async (req, res, next) => {
  try {
    const request = await confirmRequest(req.user.id, req.params.id);
    if (request?.status === "COMPLETED") {
      await sendRequestLifecyclePushSafe({
        event: "REQUEST_COMPLETED",
        request,
        actorId: req.user.id,
      });
    }
    res.status(200).json({ success: true, request });
  } catch (err) {
    next(err);
  }
};

export const cancelRequestHandler = async (req, res, next) => {
  try {
    const request = await cancelRequest(req.user.id, req.params.id);
    await sendRequestLifecyclePushSafe({
      event: "REQUEST_CANCELED",
      request,
      actorId: req.user.id,
    });
    res.status(200).json({ success: true, request });
  } catch (err) {
    next(err);
  }
};

export const deleteRequestHandler = async (req, res, next) => {
  try {
    const request = await deleteRequest(req.user.id, req.params.id);
    await sendRequestLifecyclePushSafe({
      event: "REQUEST_CANCELED",
      request,
      actorId: req.user.id,
    });
    res.status(200).json({ success: true, request });
  } catch (err) {
    next(err);
  }
};

export const historyHandler = async (req, res, next) => {
  try {
    const query = historyQuerySchema.parse(req.query || {});
    const role = query.role ? query.role.toLowerCase() : "all";
    const result = await getHistory(req.user.id, role, query);
    res.status(200).json({
      success: true,
      data: result.history,
      pagination: result.pagination,
      history: result.history,
    });
  } catch (err) {
    next(err);
  }
};

export const hardDeleteRequestHandler = async (req, res, next) => {
  try {
    const result = await hardDeleteRequest(req.user.id, req.params.id);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};
