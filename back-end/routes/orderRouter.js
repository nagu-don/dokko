import express from "express";
import { placeOrder, listOrders, updateOrderStatus, myOrders, listOrdersByVendor, getAdditionalChargesConfig } from "../controllers/orderController.js";
import { getOrderPayment, initiateCustomerPayment } from "../controllers/paymentController.js";
import { authUser, authAdmin } from "../middleware/authMiddleware.js";

const orderRouter = express.Router();

orderRouter.get("/config/additional-charges", getAdditionalChargesConfig);
orderRouter.post("/place", authUser, placeOrder);
orderRouter.get("/list", authAdmin, listOrders);
orderRouter.get("/my", authUser, myOrders);
orderRouter.get("/vendor/:vendorId", authAdmin, listOrdersByVendor);
orderRouter.patch("/status/:id", authAdmin, updateOrderStatus);

// Customer-owned payment surface (Phase 8A audit §C / §P-4 / §P-5 / §P-6).
// Ownership is enforced inside getOrderPayment / initiateCustomerPayment
// (order.user === req.account._id). Amounts are always server-authoritative.
orderRouter.get("/:orderId/payment", authUser, getOrderPayment);
orderRouter.post("/:orderId/payment", authUser, initiateCustomerPayment);

export default orderRouter;
