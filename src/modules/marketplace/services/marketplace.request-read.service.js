import ItemRequest from "../models/request.model.js";
import { formatRequestWithUsers, requestPopulate } from "./marketplace.presenters.js";
import { buildPagination, buildRequestSort, parsePagination } from "./marketplace.query.js";

export const getRequestWithNames = async (requestId, viewerId = null) => {
  const request = await ItemRequest.findById(requestId)
    .populate(requestPopulate)
    .lean();
  return formatRequestWithUsers(request, { viewerId });
};

export const getRequestsWithNames = async (
  filter,
  options = {},
  viewerId = null
) => {
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
    requests: requests.map((request) =>
      formatRequestWithUsers(request, { viewerId })
    ),
    pagination: buildPagination({
      page: pagination.page,
      limit: pagination.limit,
      total,
      hasPagination: pagination.hasPagination,
    }),
  };
};
