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
  getMe,
  updateFinancePermission,
  changePassword,
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
import { authAdmin, authFinanceAdmin } from "../middleware/authMiddleware.js";
import { adminLoginLimiter, registerLimiter } from "../middleware/rateLimiter.js";

const adminRouter = express.Router();

adminRouter.post("/register", registerLimiter, registerAdmin);
adminRouter.post("/login", adminLoginLimiter, loginAdmin);

// ── Current admin profile (requires active admin) ─────────────
adminRouter.get("/me", authAdmin, getMe);
adminRouter.patch("/change-password", authAdmin, changePassword);

// ── Admin management (requires active admin) ─────────────────
adminRouter.get("/pending", authAdmin, listPendingAdmins);
adminRouter.patch("/approve/:id", authAdmin, approveAdmin);
adminRouter.patch("/reject/:id", authAdmin, rejectAdmin);
adminRouter.get("/all", authAdmin, listAllAdmins);
adminRouter.get("/activity/:adminId", authAdmin, getAdminActivity);
adminRouter.delete("/remove/:id", authAdmin, removeAdmin);

// ── Finance permission management (finance-gated) ─────────────
adminRouter.patch("/finance-permission/:id", authFinanceAdmin, updateFinancePermission);

// ── Commission configuration ────────────────────────────────
adminRouter.get("/commission-config", authAdmin, getCommissionConfig);
adminRouter.patch("/commission-config", authAdmin, updateCommissionConfig);

// ── Settlement management ───────────────────────────────────
// approve/pay move money and are finance-gated; view/cancel remain
// available to every authenticated admin.
adminRouter.get("/settlements", authAdmin, listSettlements);
adminRouter.get("/settlements/:id", authAdmin, getSettlement);
adminRouter.patch("/settlements/:id/approve", authFinanceAdmin, approveSettlement);
adminRouter.patch("/settlements/:id/pay", authFinanceAdmin, markSettlementPaid);
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
