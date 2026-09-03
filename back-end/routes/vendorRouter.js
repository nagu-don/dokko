import express from "express";
import {
  registerVendor,
  loginVendor,
  googleAuthVendor,
  vendorProfile,
  updateVendorLocation,
  updateVendorLiveLocation,
  getPayoutInfo,
  updatePayoutInfo,
  listNewRequests,
  listAcceptedRequests,
  listCompletedRequests,
  acceptRequest,
  completeRequest,
  itemsSummary,
  hideItems,
  unhideItems,
  listVendors,
} from "../controllers/vendorController.js";
import { initiatePayment, getPaymentStatus, triggerVerification, recordCashPayment, cancelPayment, revokeCashPayment, completeMockPayment } from "../controllers/paymentController.js";
import { authVendor, authAdmin } from "../middleware/authMiddleware.js";

const vendorRouter = express.Router();

vendorRouter.post("/register", registerVendor);
vendorRouter.post("/login", loginVendor);
vendorRouter.post("/google", googleAuthVendor);

vendorRouter.get("/", authAdmin, listVendors);

vendorRouter.get("/me", authVendor, vendorProfile);
vendorRouter.patch("/location", authVendor, updateVendorLocation);
vendorRouter.patch("/live-location", authVendor, updateVendorLiveLocation);

vendorRouter.get("/payout", authVendor, getPayoutInfo);
vendorRouter.patch("/payout", authVendor, updatePayoutInfo);

vendorRouter.get("/requests/new", authVendor, listNewRequests);
vendorRouter.get("/requests/accepted", authVendor, listAcceptedRequests);
vendorRouter.get("/requests/completed", authVendor, listCompletedRequests);
vendorRouter.patch("/requests/accept/:id", authVendor, acceptRequest);
vendorRouter.patch("/requests/complete/:id", authVendor, completeRequest);
vendorRouter.post("/payments/initiate/:orderId", authVendor, initiatePayment);
vendorRouter.post("/payments/cash/:orderId", authVendor, recordCashPayment);
vendorRouter.post("/payments/cancel/:orderId", authVendor, cancelPayment);
vendorRouter.post("/payments/revoke-cash/:orderId", authVendor, revokeCashPayment);
vendorRouter.get("/payments/status/:paymentId", authVendor, getPaymentStatus);
vendorRouter.post("/payments/verify/:paymentId", authVendor, triggerVerification);
vendorRouter.post("/payments/mock/:paymentId/complete", authVendor, completeMockPayment);

// ── payment callbacks — PUBLIC (no auth) ─────────────────────
// The gateway calls these directly after the customer pays.
vendorRouter.get("/summary", authVendor, itemsSummary);
vendorRouter.post("/summary/hide-items", authVendor, hideItems);
vendorRouter.post("/summary/unhide-items", authVendor, unhideItems);

export default vendorRouter;
