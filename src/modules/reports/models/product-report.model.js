import mongoose from "mongoose";
import {
  REPORT_CATEGORIES,
  REPORT_STATUSES,
} from "../reports.constants.js";

const reportCommentSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    text: {
      type: String,
      trim: true,
      maxlength: 1000,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const productReportSchema = new mongoose.Schema(
  {
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      required: true,
      index: true,
    },
    reporterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: REPORT_CATEGORIES,
      required: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    status: {
      type: String,
      enum: REPORT_STATUSES,
      default: "OPEN",
      index: true,
    },
    comments: {
      type: [reportCommentSchema],
      default: [],
    },
  },
  { timestamps: true }
);

productReportSchema.index({ itemId: 1, createdAt: -1 });
productReportSchema.index({ reporterId: 1, createdAt: -1 });
productReportSchema.index({ itemId: 1, reporterId: 1, createdAt: -1 });
productReportSchema.index({ status: 1, createdAt: -1 });
productReportSchema.index({ category: 1, createdAt: -1 });
productReportSchema.index({ status: 1, updatedAt: -1 });
productReportSchema.index({ itemId: 1, updatedAt: -1 });
productReportSchema.index({ reporterId: 1, updatedAt: -1 });

export default mongoose.model("ProductReport", productReportSchema);
