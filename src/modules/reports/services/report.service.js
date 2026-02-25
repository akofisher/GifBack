import mongoose from "mongoose";
import { conflict, forbidden, notFound } from "../../../utils/appError.js";
import Item from "../../marketplace/models/item.model.js";
import ProductReport from "../models/product-report.model.js";
import {
  REPORT_LIMIT_MESSAGE,
  REPORT_LIMIT_PER_WINDOW,
  REPORT_WINDOW_MS,
} from "../reports.constants.js";

const buildName = (firstName, lastName) =>
  [firstName, lastName].filter(Boolean).join(" ").trim();

const reportPopulate = [
  {
    path: "reporterId",
    select: "firstName lastName email phone role isActive avatar",
  },
  {
    path: "itemId",
    select:
      "title description images mode status ownerId categoryId countryId cityId address createdAt updatedAt",
    populate: [
      {
        path: "ownerId",
        select: "firstName lastName email phone role isActive avatar",
      },
      {
        path: "categoryId",
        select: "name isActive order",
      },
      {
        path: "countryId",
        select: "name localName code isActive order cities",
      },
    ],
  },
];

const formatAdminReport = (report) => {
  if (!report) return null;
  const reporter =
    report.reporterId && typeof report.reporterId === "object"
      ? report.reporterId
      : null;
  const item =
    report.itemId && typeof report.itemId === "object" ? report.itemId : null;
  const itemOwner =
    item?.ownerId && typeof item.ownerId === "object" ? item.ownerId : null;
  const itemCategory =
    item?.categoryId && typeof item.categoryId === "object" ? item.categoryId : null;
  const itemCountry =
    item?.countryId && typeof item.countryId === "object" ? item.countryId : null;
  const itemCity =
    itemCountry?.cities?.find(
      (entry) => entry?._id?.toString?.() === item?.cityId?.toString?.()
    ) || null;

  const reporterName = reporter ? buildName(reporter.firstName, reporter.lastName) : "";
  const ownerName = itemOwner ? buildName(itemOwner.firstName, itemOwner.lastName) : "";

  return {
    ...report,
    reporterId: reporter?._id?.toString?.() || report.reporterId,
    itemId: item?._id?.toString?.() || report.itemId,
    reporterName,
    reporter: reporter
      ? {
          id: reporter._id?.toString?.() || "",
          firstName: reporter.firstName || "",
          lastName: reporter.lastName || "",
          name: reporterName,
          email: reporter.email || "",
          phone: reporter.phone || "",
          role: reporter.role || "",
          isActive: reporter.isActive,
          avatar: reporter.avatar || null,
        }
      : null,
    item: item
      ? {
          id: item._id?.toString?.() || "",
          title: item.title || "",
          description: item.description || "",
          images: item.images || [],
          mode: item.mode || "",
          status: item.status || "",
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          categoryId: itemCategory?._id?.toString?.() || item.categoryId || null,
          categoryName: itemCategory?.name || "",
          ownerId: itemOwner?._id?.toString?.() || item.ownerId || null,
          ownerName,
          countryId: itemCountry?._id?.toString?.() || item.countryId || null,
          cityId: itemCity?._id?.toString?.() || item.cityId || null,
          country: itemCountry
            ? {
                id: itemCountry._id?.toString?.() || "",
                name: itemCountry.name || "",
                localName: itemCountry.localName || "",
                code: itemCountry.code || "",
              }
            : null,
          city: itemCity
            ? {
                id: itemCity._id?.toString?.() || "",
                name: itemCity.name || "",
                localName: itemCity.localName || "",
              }
            : null,
          address: item.address || "",
        }
      : null,
    itemOwner: itemOwner
      ? {
          id: itemOwner._id?.toString?.() || "",
          firstName: itemOwner.firstName || "",
          lastName: itemOwner.lastName || "",
          name: ownerName,
          email: itemOwner.email || "",
          phone: itemOwner.phone || "",
          role: itemOwner.role || "",
          isActive: itemOwner.isActive,
          avatar: itemOwner.avatar || null,
        }
      : null,
    itemCategory: itemCategory
      ? {
          id: itemCategory._id?.toString?.() || "",
          name: itemCategory.name || "",
          isActive: itemCategory.isActive,
          order: itemCategory.order,
        }
      : null,
  };
};

const buildSort = (sort) => {
  if (sort === "createdAt_asc") return { createdAt: 1, _id: 1 };
  if (sort === "updatedAt_desc") return { updatedAt: -1, _id: -1 };
  if (sort === "updatedAt_asc") return { updatedAt: 1, _id: 1 };
  return { createdAt: -1, _id: -1 };
};

const buildPagination = ({ page = 1, limit = 20, total = 0 }) => ({
  page,
  limit,
  total,
  pages: Math.max(1, Math.ceil(total / limit)),
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

const computeRetryAt = (recentReports) => {
  if (!recentReports?.length) return new Date(Date.now() + REPORT_WINDOW_MS);

  const pivotIndex = Math.max(0, recentReports.length - REPORT_LIMIT_PER_WINDOW);
  const pivotDate = new Date(recentReports[pivotIndex]?.createdAt);
  if (Number.isNaN(pivotDate.getTime())) {
    return new Date(Date.now() + REPORT_WINDOW_MS);
  }
  return new Date(pivotDate.getTime() + REPORT_WINDOW_MS);
};

export const createProductReport = async (reporterId, payload) => {
  if (!mongoose.Types.ObjectId.isValid(payload.itemId)) {
    throw notFound("Item not found", "ITEM_NOT_FOUND");
  }

  const item = await Item.findById(payload.itemId).select("_id ownerId").lean();
  if (!item) {
    throw notFound("Item not found", "ITEM_NOT_FOUND");
  }

  if (item.ownerId.toString() === reporterId.toString()) {
    throw forbidden(
      "You cannot report your own product",
      "REPORT_CANNOT_REPORT_OWN_ITEM"
    );
  }

  const windowStart = new Date(Date.now() - REPORT_WINDOW_MS);
  const recentReports = await ProductReport.find({
    itemId: item._id,
    reporterId,
    createdAt: { $gte: windowStart },
  })
    .select("createdAt")
    .sort({ createdAt: 1 })
    .lean();

  if (recentReports.length >= REPORT_LIMIT_PER_WINDOW) {
    const retryAt = computeRetryAt(recentReports);
    throw conflict(REPORT_LIMIT_MESSAGE, "REPORT_LIMIT_PRODUCT_24H", [
      { field: "retryAt", message: retryAt.toISOString() },
    ]);
  }

  const description = payload.description?.trim();
  const [report] = await ProductReport.create([
    {
      itemId: item._id,
      reporterId,
      category: payload.category,
      ...(description ? { description } : {}),
    },
  ]);

  const hydrated = await ProductReport.findById(report._id)
    .populate(reportPopulate)
    .lean();
  return formatAdminReport(hydrated);
};

export const listAdminReports = async (query) => {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;

  if (query.itemId && !mongoose.Types.ObjectId.isValid(query.itemId)) {
    return { reports: [], pagination: buildPagination({ page, limit, total: 0 }) };
  }
  if (query.reporterId && !mongoose.Types.ObjectId.isValid(query.reporterId)) {
    return { reports: [], pagination: buildPagination({ page, limit, total: 0 }) };
  }

  const filter = {};

  if (query.itemId) {
    filter.itemId = query.itemId;
  }
  if (query.reporterId) {
    filter.reporterId = query.reporterId;
  }
  if (query.status) {
    filter.status = query.status;
  }
  if (query.category) {
    filter.category = query.category;
  }

  const skip = (page - 1) * limit;
  const sort = buildSort(query.sort);

  const [reports, total] = await Promise.all([
    ProductReport.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate(reportPopulate)
      .lean(),
    ProductReport.countDocuments(filter),
  ]);

  return {
    reports: reports.map(formatAdminReport),
    pagination: buildPagination({ page, limit, total }),
  };
};

export const getAdminReportById = async (reportId) => {
  if (!mongoose.Types.ObjectId.isValid(reportId)) {
    throw notFound("Report not found", "REPORT_NOT_FOUND");
  }

  const report = await ProductReport.findById(reportId)
    .populate(reportPopulate)
    .lean();
  if (!report) {
    throw notFound("Report not found", "REPORT_NOT_FOUND");
  }
  return formatAdminReport(report);
};

export const updateAdminReportStatus = async (reportId, status) => {
  if (!mongoose.Types.ObjectId.isValid(reportId)) {
    throw notFound("Report not found", "REPORT_NOT_FOUND");
  }

  const report = await ProductReport.findByIdAndUpdate(
    reportId,
    { $set: { status } },
    { new: true }
  )
    .populate(reportPopulate)
    .lean();

  if (!report) {
    throw notFound("Report not found", "REPORT_NOT_FOUND");
  }

  return formatAdminReport(report);
};
