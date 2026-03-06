import {
  addAdminReportComment,
  createProductReport,
  getAdminReportById,
  listAdminReports,
  updateAdminReportStatus,
} from "../services/report.service.js";
import {
  addReportCommentSchema,
  createProductReportSchema,
  listAdminReportsSchema,
  updateReportStatusSchema,
} from "../validators/report.validators.js";

export const createProductReportHandler = async (req, res, next) => {
  try {
    const payload = createProductReportSchema.parse(req.body);
    const report = await createProductReport(req.user.id, payload);
    res.status(201).json({ success: true, report });
  } catch (err) {
    next(err);
  }
};

export const listAdminReportsHandler = async (req, res, next) => {
  try {
    const query = listAdminReportsSchema.parse(req.query || {});
    const result = await listAdminReports(query);
    res.status(200).json({
      success: true,
      data: {
        items: result.reports,
        pagination: result.pagination,
      },
      ...result,
    });
  } catch (err) {
    next(err);
  }
};

export const getAdminReportByIdHandler = async (req, res, next) => {
  try {
    const report = await getAdminReportById(req.params.id);
    res.status(200).json({ success: true, report });
  } catch (err) {
    next(err);
  }
};

export const updateAdminReportStatusHandler = async (req, res, next) => {
  try {
    const payload = updateReportStatusSchema.parse(req.body);
    const report = await updateAdminReportStatus(req.params.id, payload.status);
    res.status(200).json({ success: true, report });
  } catch (err) {
    next(err);
  }
};

export const addAdminReportCommentHandler = async (req, res, next) => {
  try {
    const payload = addReportCommentSchema.parse(req.body);
    const report = await addAdminReportComment(req.params.id, req.user.id, payload.text);
    res.status(200).json({ success: true, report });
  } catch (err) {
    next(err);
  }
};
