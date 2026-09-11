import issueReportModel, { ISSUE_SEVERITIES } from "../models/issueReportModel.js";
import logger from "./logger.js";

/**
 * Record a server-side failure into the admin-visible issue pipeline
 * (source: 'backend', type: 'system_error') without any HTTP round-trip.
 *
 * Kept separate from utils/logger.js so that file stays focused on pino.
 * Best-effort: never throws — a failing issue pipeline must not crash the
 * code path that reported into it.
 */
export const logSystemIssue = async (message, { severity = "medium", metadata } = {}) => {
  try {
    await issueReportModel.create({
      source: "backend",
      type: "system_error",
      message: String(message ?? "Unknown backend error").slice(0, 2000),
      severity: ISSUE_SEVERITIES.includes(severity) ? severity : "medium",
      metadata: metadata === undefined ? undefined : metadata,
    });
  } catch (err) {
    logger.error({ err }, "Failed to record system issue");
  }
};

export default logSystemIssue;