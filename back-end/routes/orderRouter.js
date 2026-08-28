import express from "express";
import { placeOrder, listOrders, updateOrderStatus, myOrders, listOrdersByVendor, getAdditionalChargesConfig } from "../controllers/orderController.js";
import { authUser, authAdmin } from "../middleware/authMiddleware.js";

const orderRouter = express.Router();

orderRouter.get("/config/additional-charges", getAdditionalChargesConfig);
orderRouter.post("/place", authUser, placeOrder);
orderRouter.get("/list", authAdmin, listOrders);
orderRouter.get("/my", authUser, myOrders);
orderRouter.get("/vendor/:vendorId", authAdmin, listOrdersByVendor);
orderRouter.patch("/status/:id", authAdmin, updateOrderStatus);

export default orderRouter;
