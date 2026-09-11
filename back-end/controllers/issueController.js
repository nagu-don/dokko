import jwt from "jsonwebtoken";
import issueReportModel, {
  ISSUE_SOURCES,
  ISSUE_TYPES,
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
} from "../models/issueReportModel.js";
import userModel from "../models/userModel.js";
import vendorModel from "../models/vendorModel.js";
import logger from "../utils/logger.js";

/**
 * POST /api/issues
 *
 * Public — a crashing app may not have a valid session. Body is accepted
 * as-is and the response is deliberately minimal: never leak internal error
 * detail back to a potentially-compromised or crashing client.
 *
 * If a valid Authorization header is present, best-effort decode it to
 * attribute the report to a user or vendor. A bad/expired token is NOT an
 * error for this endpoint — the report is simply stored anonymously.
 */
export const createIssueReport = async (req, res) => {
  try {
    const {
      source,
      type,
      message,
      stack,
      route,
      severity,
      appVersion,
      platform,
      contactEmail,
      metadata,
    } = req.body || {};

    if (!ISSUE_SOURCES.includes(source)) {
      return res.status(400).json({
        success: false,
        message: `source must be one of: ${ISSUE_SOURCES.join(", ")}`,
      });
    }

    if (!ISSUE_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `type must be one of: ${ISSUE_TYPES.join(", ")}`,
      });
    }

    if (typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ success: false, message: "message is required" });
    }

    if (message.length > 2000) {
      return res.status(400).json({ success: false, message: "message must be 2000 characters or fewer" });
    }

    if (severity !== undefined && !ISSUE_SEVERITIES.includes(severity)) {
      return res.status(400).json({
        success: false,
        message: `severity must be one of: ${ISSUE_SEVERITIES.join(", ")}`,
      });
    }

    // Best-effort attribution — a failure here must never fail the report.
    let userId;
    let vendorId;
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded?.id) {
          const foundUser = await userModel.findById(decoded.id).catch(() => null);
          const foundVendor = foundUser
            ? null
            : await vendorModel.findById(decoded.id).catch(() => null);
          if (foundUser) userId = foundUser._id;
          else if (foundVendor) vendorId = foundVendor._id;
        }
      } catch {
        // invalid/expired token — report stays anonymous, no error
      }
    }

    const report = await issueReportModel.create({
      source,
      type,
      message: message.trim(),
      stack: typeof stack === "string" ? stack.slice(0, 8000) : undefined,
      route: typeof route === "string" ? route.slice(0, 500) : undefined,
      severity: severity ?? "medium",
      appVersion: typeof appVersion === "string" ? appVersion.slice(0, 100) : undefined,
      platform: typeof platform === "string" ? platform.slice(0, 100) : undefined,
      contactEmail: typeof contactEmail === "string" ? contactEmail.slice(0, 200) : undefined,
      metadata: metadata === undefined ? undefined : metadata,
      userId,
      vendorId,
    });

    res.status(201).json({
      success: true,
      message: "Report received",
      data: { id: report._id },
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to store issue report");
    res.status(500).json({ success: false, message: "Failed to store report" });
  }
};

/**
 * GET /api/issues (authAdmin)
 *
 * List issue reports with optional status/source/type/severity filters and
 * page/limit pagination (same pattern as settlementController.listSettlements).
 */
export const listIssueReports = async (req, res) => {
  try {
    const { status, source, type, severity, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (source) filter.source = source;
    if (type) filter.type = type;
    if (severity) filter.severity = severity;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [reports, total] = await Promise.all([
      issueReportModel
        .find(filter)
        .populate("userId", "name email")
        .populate("vendorId", "name email phone")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      issueReportModel.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: reports,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to list issue reports");
    res.status(500).json({ success: false, message: "Failed to list issue reports" });
  }
};

/**
 * PATCH /api/issues/:id/status (authAdmin)
 *
 * Update a report's status and optionally attach an admin note. When the
 * status becomes 'resolved' or 'ignored', record who resolved it and when.
 */
export const updateIssueReportStatus = async (req, res) => {
  try {
    const { status, adminNote } = req.body || {};

    if (!ISSUE_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `status must be one of: ${ISSUE_STATUSES.join(", ")}`,
      });
    }

    const report = await issueReportModel.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: "Issue report not found" });
    }

    report.status = status;
    if (adminNote !== undefined) report.adminNote = String(adminNote);

    if (status === "resolved" || status === "ignored") {
      report.resolvedByAdminId = req.account._id;
      report.resolvedAt = new Date();
    }

    await report.save();

    res.json({ success: true, message: "Issue report updated", data: report });
  } catch (error) {
    logger.error({ err: error }, "Failed to update issue report");
    res.status(500).json({ success: false, message: "Failed to update issue report" });
  }
};

/**
 * GET /api/issues/summary (authAdmin)
 *
 * Counts grouped by status and by severity for the admin dashboard, plus the
 * number of open reports.
 */
export const getIssueReportsSummary = async (req, res) => {
  try {
    const [byStatusRows, bySeverityRows] = await Promise.all([
      issueReportModel.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      issueReportModel.aggregate([{ $group: { _id: "$severity", count: { $sum: 1 } } }]),
    ]);

    const byStatus = Object.fromEntries(ISSUE_STATUSES.map((s) => [s, 0]));
    for (const row of byStatusRows) {
      if (row._id) byStatus[row._id] = row.count;
    }

    const bySeverity = Object.fromEntries(ISSUE_SEVERITIES.map((s) => [s, 0]));
    for (const row of bySeverityRows) {
      if (row._id) bySeverity[row._id] = row.count;
    }

    res.json({
      success: true,
      data: {
        byStatus,
        bySeverity,
        totalOpen: byStatus.open,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to load issue reports summary");
    res.status(500).json({ success: false, message: "Failed to load issue reports summary" });
  }
};