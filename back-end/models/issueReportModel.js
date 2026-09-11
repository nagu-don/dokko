import mongoose from "mongoose";

export const ISSUE_SOURCES = ["mobile_customer", "mobile_vendor", "front_end", "vendor_web", "admin_web", "backend"];
export const ISSUE_TYPES = ["crash", "unhandled_error", "user_report", "system_error"];
export const ISSUE_SEVERITIES = ["low", "medium", "high", "critical"];
export const ISSUE_STATUSES = ["open", "acknowledged", "resolved", "ignored"];

const issueReportSchema = new mongoose.Schema({
  source: {
    type: String,
    required: true,
    enum: ISSUE_SOURCES,
  },
  type: {
    type: String,
    required: true,
    enum: ISSUE_TYPES,
  },
  message: {
    type: String,
    required: true,
    maxlength: 2000,
  },
  stack: {
    type: String,
    maxlength: 8000,
  },
  route: String,
  severity: {
    type: String,
    enum: ISSUE_SEVERITIES,
    default: "medium",
  },
  appVersion: String,
  platform: String,
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "vendor",
  },
  contactEmail: String,
  metadata: {
    type: mongoose.Schema.Types.Mixed,
  },
  status: {
    type: String,
    enum: ISSUE_STATUSES,
    default: "open",
  },
  resolvedByAdminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "admin",
  },
  resolvedAt: Date,
  adminNote: String,
}, { timestamps: true });

issueReportSchema.index({ status: 1, createdAt: -1 });
issueReportSchema.index({ createdAt: -1 });

const issueReportModel = mongoose.model("issuereports", issueReportSchema);
export default issueReportModel;