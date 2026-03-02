import ItemRequest from "../models/request.model.js";
import { formatRequestWithUsers, requestPopulate } from "./marketplace.presenters.js";
import { buildPagination, buildRequestSort, parsePagination } from "./marketplace.query.js";

export const getRequestWithNames = async (requestId) => {
  const request = await ItemRequest.findById(requestId)
    .populate(requestPopulate)
    .lean();
  return formatRequestWithUsers(request);
};

export const getRequestsWithNames = async (filter, options = {}) => {
  const pagination = parsePagination(options);
  const sort = buildRequestSort(options.sort);

  let query = ItemRequest.find(filter)
    .sort(sort)
    .populate(requestPopulate);

  if (pagination.hasPagination) {
    query = query.skip(pagination.skip).limit(pagination.limit);
  }

  const [requests, total] = await Promise.all([
    query.lean(),
    ItemRequest.countDocuments(filter),
  ]);

  return {
    requests: requests.map(formatRequestWithUsers),
    pagination: buildPagination({
      page: pagination.page,
      limit: pagination.limit,
      total,
      hasPagination: pagination.hasPagination,
    }),
  };
};
