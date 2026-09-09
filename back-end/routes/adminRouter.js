import express from "express";
import {
  loginAdmin,
  registerAdmin,
  listPendingAdmins,
  approveAdmin,
  rejectAdmin,
  listAllAdmins,
  getAdminActivity,
  removeAdmin,
} from "../controllers/adminController.js";
import {
  getCommissionConfig,
  updateCommissionConfig,
  listSettlements,
  getSettlement,
  approveSettlement,
  markSettlementPaid,
  cancelSettlement,
  getCompanyAccount,
  getVendorPayables,
  getCashTransactions,
} from "../controllers/settlementController.js";
import { createNotice, listNotices, deleteNotice } from "../controllers/noticeController.js";
import { authAdmin } from "../middleware/authMiddleware.js";
import { adminLoginLimiter, registerLimiter } from "../middleware/rateLimiter.js";

const adminRouter = express.Router();

adminRouter.post("/register", registerLimiter, registerAdmin);
adminRouter.post("/login", adminLoginLimiter, loginAdmin);

// ── Admin management (requires active admin) ─────────────────
adminRouter.get("/pending", authAdmin, listPendingAdmins);
adminRouter.patch("/approve/:id", authAdmin, approveAdmin);
adminRouter.patch("/reject/:id", authAdmin, rejectAdmin);
adminRouter.get("/all", authAdmin, listAllAdmins);
adminRouter.get("/activity/:adminId", authAdmin, getAdminActivity);
adminRouter.delete("/remove/:id", authAdmin, removeAdmin);

// ── Commission configuration ────────────────────────────────
adminRouter.get("/commission-config", authAdmin, getCommissionConfig);
adminRouter.patch("/commission-config", authAdmin, updateCommissionConfig);

// ── Settlement management ───────────────────────────────────
adminRouter.get("/settlements", authAdmin, listSettlements);
adminRouter.get("/settlements/:id", authAdmin, getSettlement);
adminRouter.patch("/settlements/:id/approve", authAdmin, approveSettlement);
adminRouter.patch("/settlements/:id/pay", authAdmin, markSettlementPaid);
adminRouter.patch("/settlements/:id/cancel", authAdmin, cancelSettlement);

// ── Company account & vendor payables ───────────────────────
adminRouter.get("/company-account", authAdmin, getCompanyAccount);
adminRouter.get("/vendor-payables", authAdmin, getVendorPayables);

// ── Cash transaction tracking ────────────────────────────────
adminRouter.get("/cash-transactions", authAdmin, getCashTransactions);

// ── Vendor notices (broadcasts) ─────────────────────────────
adminRouter.get("/notices", authAdmin, listNotices);
adminRouter.post("/notices", authAdmin, createNotice);
adminRouter.delete("/notices/:id", authAdmin, deleteNotice);

export default adminRouter;
