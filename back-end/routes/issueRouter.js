import express from "express";
import {
  createIssueReport,
  listIssueReports,
  updateIssueReportStatus,
  getIssueReportsSummary,
} from "../controllers/issueController.js";
import { authAdmin } from "../middleware/authMiddleware.js";
import { issueReportLimiter } from "../middleware/rateLimiter.js";

const issueRouter = express.Router();

// Public (rate-limited, no auth — a crashed app may not hold a session)
issueRouter.post("/", issueReportLimiter, createIssueReport);

// Admin-only surface
issueRouter.get("/", authAdmin, listIssueReports);
issueRouter.get("/summary", authAdmin, getIssueReportsSummary);
issueRouter.patch("/:id/status", authAdmin, updateIssueReportStatus);

export default issueRouter;