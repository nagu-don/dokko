import crypto from "node:crypto";
import mongoose from "mongoose";
import QRCode from "qrcode";
import orderModel from "../models/orderModel.js";
import paymentModel from "../models/paymentModel.js";
import settlementModel from "../models/settlementModel.js";
import vendorModel from "../models/vendorModel.js";
import companyAccountModel from "../models/companyAccountModel.js";
import commissionConfigModel from "../models/commissionConfigModel.js";
import { getProviderByName, getGatewayStatus } from "../gateway/index.js";

// ── generate a unique merchant reference per payment attempt ───
const makeMerchantRef = (orderId) => {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(3).toString("hex");
  return `DKO-${String(orderId).slice(-4)}-${ts}-${rand}`;
};

// ── calculate the authoritative payment amount server-side ─────
// Never trust req.body.amount — always recompute from the order.
// deliveryCharge may be null (priority search in progress) — treat as 0
const computeAmount = (order) => {
  const goods = Number(order.subtotal);
  const delivery = Number(order.deliveryCharge ?? 0);
  const charges = Number(order.additionalCharges);
  return Math.round((goods + delivery + charges) * 100) / 100;
};

// ── payment TTL (matches the audited 15-minute window) ─────────
const PAYMENT_TTL_MS = 15 * 60 * 1000;

// ── states that still count as "active" for duplicate protection ──
const ACTIVE_STATUSES = ["created", "qr_generated", "awaiting_payment"];

/**
 * Lazy-expiry (Phase 8A audit §J / §P-5 — BLOCKING).
 *
 * Deterministically flips an active payment to `payment_expired` once
 * `expiresAt` has passed, so read paths report a stable EXPIRED instead of
 * relying on the MongoDB TTL sweep timing (which can lag ~60 s). Returns
 * true when the payment was actually expired by this call.
 *
 * @param {Object|null} payment – payment doc (mutable)
 * @returns {Promise<boolean>}
 */
const lazyExpirePayment = async (payment) => {
  if (!payment || !ACTIVE_STATUSES.includes(payment.status)) return false;
  if (!payment.expiresAt || payment.expiresAt >= new Date()) return false;

  payment.status = "payment_expired";
  payment.failureReason = "Payment expired before it was completed";
  payment.activeAttempt = null;
  await payment.save();
  return true;
};

/**
 * Shared digital-payment initiation core used by BOTH flows:
 *   - vendor:  POST /api/vendors/payments/initiate/:orderId (authVendor)
 *   - customer: POST /api/orders/:orderId/payment           (authUser)
 *
 * Authorization/ownership is enforced by the calling ROUTE wrapper — this
 * function assumes the caller already verified the actor may act on the
 * order. Safety properties (all server-side):
 *   - The amount is ALWAYS recomputed via computeAmount(); nothing from the
 *     request body is trusted as an amount.
 *   - An existing non-expired active payment is returned, never duplicated.
 *   - `activeAttempt: "active"` plus the partial unique index on
 *     (orderId, activeAttempt) makes two identical concurrent requests
 *     coalesce into exactly ONE payment record (Phase 8A audit §K/§P-6).
 *   - Initiation is refused when money is already recorded for the order
 *     (paid/completed) or when a gateway `payment_received` exists but is
 *     not yet verified — preventing duplicate or double charges.
 *
 * @param {Object}  opts
 * @param {Object}  opts.order                  – order doc (user populated)
 * @param {string}  opts.vendorId               – assigned vendor for payment.vendorId
 * @param {string}  [opts.requestedProvider]    – key into gateway availableProviders
 * @returns {Promise<{httpStatus:number, message:string, data?:Object}>}
 */
const createDigitalPayment = async ({ order, vendorId, requestedProvider }) => {
  // ── 1. order in correct state? ──────────────────────────────
  if (order.status !== "Processing") {
    return { httpStatus: 409, message: "Only accepted orders can be completed" };
  }

  // ── 1b. delivery charge finalized? ──────────────────────────
  // deliveryCharge is null while the priority search is in progress.
  // Payment must not proceed until a vendor has accepted.
  if (order.deliveryCharge == null) {
    return {
      httpStatus: 409,
      message: "Delivery charge not yet finalized — waiting for vendor assignment",
    };
  }

  // ── 2. money already recorded for this order? ───────────────
  // paid (digital) / completed (cash) — never start another request
  // on top of captured money (audit §D / §P-7 double-collect guard).
  if (order.paymentStatus === "paid" || order.paymentStatus === "completed") {
    return { httpStatus: 409, message: "Payment already recorded for this order" };
  }

  const existingVerified = await paymentModel.findOne({
    orderId: order._id,
    status: "payment_verified",
  });
  if (existingVerified) {
    return { httpStatus: 409, message: "Payment already verified for this order" };
  }

  // ── 2b. gateway received money but verification is pending ──
  // payment_received is retryable by verification ONLY — starting a second
  // payment on top of it could double-charge the customer.
  const received = await paymentModel.findOne({
    orderId: order._id,
    status: "payment_received",
  });
  if (received) {
    return {
      httpStatus: 409,
      message: "Payment already received — awaiting confirmation",
    };
  }

  // ── 3. active payment already in progress? ──────────────────
  const activePayment = await paymentModel.findOne({
    orderId: order._id,
    status: { $in: ACTIVE_STATUSES },
  });
  if (activePayment) {
    if (!(await lazyExpirePayment(activePayment))) {
      // return the existing payment — no duplicate creation
      return {
        httpStatus: 200,
        message: "Payment already in progress",
        data: await formatPaymentResponse(activePayment),
      };
    }
  }

  // ── 4. select provider ──────────────────────────────────────
  const gatewayStatus = getGatewayStatus();

  if (!gatewayStatus.isReady) {
    return { httpStatus: 503, message: "Payment gateway is not configured" };
  }

  const providerName = requestedProvider || gatewayStatus.activeProvider;

  if (!gatewayStatus.availableProviders.includes(providerName)) {
    return { httpStatus: 400, message: `Payment provider "${providerName}" is not available` };
  }

  // ── 5. calculate authoritative amount ───────────────────────
  const amount = computeAmount(order);

  // ── 6. create payment record ────────────────────────────────
  const merchantRef = makeMerchantRef(order._id);
  const expiresAt = new Date(Date.now() + PAYMENT_TTL_MS);

  let payment;
  try {
    payment = await paymentModel.create({
      orderId: order._id,
      customerId: order.user._id,
      vendorId,
      provider: providerName,
      merchantReference: merchantRef,
      amountExpected: amount,
      status: "created",
      expiresAt,
      activeAttempt: "active",
    });
  } catch (createErr) {
    // Concurrent identical requests: the other request won the insert. The
    // winner's record has activeAttempt="active", so returning it keeps the
    // whole flow idempotent — never two live provider requests per order.
    if (createErr?.code === 11000 && /activeAttempt/.test(createErr?.message ?? "")) {
      const winner = await paymentModel.findOne({ orderId: order._id, activeAttempt: "active" });
      if (winner) {
        return {
          httpStatus: 200,
          message: "Payment already in progress",
          data: await formatPaymentResponse(winner),
        };
      }
    }
    throw createErr;
  }

  // ── 7. update order payment status ──────────────────────────
  order.paymentStatus = "pending";
  order.paymentMethod = providerName;
  await order.save();

  // ── 8. call provider to generate QR / redirect ──────────────
  const provider = getProviderByName(providerName);

  let providerResult;
  try {
    providerResult = await provider.createPayment({
      order: { _id: order._id, total: amount },
      customer: { _id: order.user._id, name: order.user.name },
      amount,
      merchantRef,
    });
  } catch (providerErr) {
    // provider call failed — reset payment and order
    payment.status = "payment_failed";
    payment.failureReason = providerErr.message;
    payment.activeAttempt = null;
    await payment.save();

    order.paymentStatus = "unpaid";
    order.paymentMethod = null;
    await order.save();

    return { httpStatus: 502, message: "Payment provider error. Please try again." };
  }

  // ── 9. persist provider output and update status ────────────
  // We persist only generic provider information. QR content, when the
  // provider supplies it, is treated as opaque provider OUTPUT — it is
  // stored verbatim, never reconstructed, and never treated as proof of
  // payment. Providers may surface vendor-specific extras via metadata.
  payment.qrReference = providerResult.qrReference || null;

  const qrOutput = providerResult.qrString ?? providerResult.metadata?.qrString ?? null;
  if (qrOutput) {
    payment.qrString = qrOutput;
  }

  // A provider that advertises a QR flow produces a scannable QR;
  // anything else is redirected or mock and waits for the customer.
  payment.status = providerResult.flow === "qr" ? "qr_generated" : "awaiting_payment";
  await payment.save();

  // ── 10. return to frontend ──────────────────────────────────
  return {
    httpStatus: 200,
    message: "Payment initiated",
    data: await formatPaymentResponse(payment, providerResult),
  };
};

/**
 * POST /api/vendors/payments/initiate/:orderId
 *
 * Vendor initiates a digital payment for an accepted order.
 * Ownership is enforced HERE (order.vendor === req.account._id); the shared
 * initiation core handles amount authority + duplicate-active safety.
 */
export const initiatePayment = async (req, res) => {
  try {
    const order = await orderModel
      .findById(req.params.orderId)
      .populate("user", "name email phone");

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (String(order.vendor) !== String(req.account._id)) {
      return res.status(403).json({
        success: false,
        message: "This order is not assigned to you",
      });
    }

    const result = await createDigitalPayment({
      order,
      vendorId: order.vendor,
      requestedProvider: req.body?.provider,
    });

    return res.status(result.httpStatus).json({
      success: result.httpStatus < 400,
      message: result.message,
      ...(result.data ? { data: result.data } : {}),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to initiate payment" });
  }
};

/**
 * POST /api/orders/:orderId/payment
 *
 * Customer initiates a digital payment for their OWN order (authUser).
 * Same server-authoritative core as the vendor route — the customer can never
 * control the amount, the provider payload, or the expiry window.
 */
export const initiateCustomerPayment = async (req, res) => {
  try {
    const order = await orderModel
      .findById(req.params.orderId)
      .populate("user", "name email phone");

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (String(order.user._id) !== String(req.account._id)) {
      return res.status(403).json({
        success: false,
        message: "You can only pay for your own orders",
      });
    }

    const result = await createDigitalPayment({
      order,
      vendorId: order.vendor,
      requestedProvider: req.body?.provider,
    });

    return res.status(result.httpStatus).json({
      success: result.httpStatus < 400,
      message: result.message,
      ...(result.data ? { data: result.data } : {}),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to initiate payment" });
  }
};

/**
 * GET /api/orders/:orderId/payment
 *
 * Customer payment state for their OWN order (authUser). Returns:
 *   - order summary (status / paymentStatus / paymentMethod)
 *   - `paymentRequired` + `canInitiate` + the authoritative amount
 *   - available providers (no secrets / config)
 *   - the relevant payment attempt (active, or most recent otherwise) —
 *     lazily expired so the client gets a deterministic `payment_expired`.
 *
 * This endpoint CANNOT mark an order paid — that only happens through the
 * server-side verification path. Nothing here ever trusts a client amount.
 */
export const getOrderPayment = async (req, res) => {
  try {
    const order = await orderModel.findById(req.params.orderId);

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (String(order.user) !== String(req.account._id)) {
      return res.status(403).json({
        success: false,
        message: "You can only view payments for your own orders",
      });
    }

    // Active attempt takes priority; otherwise surface the most recent one.
    const active = await paymentModel.findOne({
      orderId: order._id,
      status: { $in: ACTIVE_STATUSES },
    });
    if (active) {
      await lazyExpirePayment(active);
    }
    const latest = await paymentModel.findOne({ orderId: order._id }).sort({ createdAt: -1 });
    const payment = active || latest;

    const moneyRecorded =
      order.paymentStatus === "paid" || order.paymentStatus === "completed";
    const payable =
      order.status === "Processing" && order.deliveryCharge != null && !moneyRecorded;

    const hasReceived = await paymentModel.exists({
      orderId: order._id,
      status: "payment_received",
    });

    const gatewayStatus = getGatewayStatus();

    return res.json({
      success: true,
      data: {
        order: {
          status: order.status,
          paymentStatus: order.paymentStatus,
          paymentMethod: order.paymentMethod,
        },
        paymentRequired: payable,
        canInitiate: payable && !hasReceived,
        amount: payable ? computeAmount(order) : null,
        availableProviders: gatewayStatus.isReady
          ? gatewayStatus.availableProviders
          : [],
        payment: payment ? await formatPaymentResponse(payment) : null,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to load payment state" });
  }
};

// ── shape the payment data for the frontend ────────────────────
// SECURITY: never include provider secrets, internal config, or raw payloads.
// The frontend must NOT receive provider credentials or merchant config.
async function formatPaymentResponse(payment, providerResult = null) {
  const data = {
    paymentId: payment._id,
    provider: payment.provider,
    amount: payment.amountExpected,
    reference: payment.merchantReference,
    status: payment.status,
    expiresAt: payment.expiresAt,
  };

    if (providerResult) {
    if (providerResult.flow) data.flow = providerResult.flow;
    // The QR image is rendered locally from the exact provider-returned
    // QR content — treated as opaque provider output and never modified.
    const qrOutput =
      providerResult.qrString ??
      providerResult.metadata?.qrString ??
      (payment.qrString || null);
    if (qrOutput) {
      data.flow = "qr";
      try {
        data.qrData = await QRCode.toDataURL(qrOutput, { width: 300, margin: 2, errorCorrectionLevel: "M" });
      } catch (qrErr) {
        // QR rendering failure — do not fail the whole request; the payment
        // record still holds the provider's output.
        console.error("QR image render failed:", qrErr.message);
      }
    }
  } else if (payment.qrString) {
    data.flow = "qr";
    try {
      data.qrData = await QRCode.toDataURL(payment.qrString, { width: 300, margin: 2, errorCorrectionLevel: "M" });
    } catch (qrErr) {
      console.error("QR image render failed:", qrErr.message);
    }
  }

  return data;
}

/**
 * POST /api/vendors/payments/cash/:orderId
 *
 * Vendor records a cash payment for an accepted order.
 * Creates a payment record with status "cash_recorded" and tracks
 * a cash handling fee to be deducted from the vendor's next settlement.
 */
export const recordCashPayment = async (req, res) => {
  try {
    // ── 1. order exists? ───────────────────────────────────────
    const order = await orderModel
      .findById(req.params.orderId)
      .populate("user", "name email phone");

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // ── 2. order belongs to this vendor? ───────────────────────
    if (String(order.vendor) !== String(req.account._id)) {
      return res.status(403).json({
        success: false,
        message: "This order is not assigned to you",
      });
    }

    // ── 3. order in correct state? ─────────────────────────────
    if (order.status !== "Processing") {
      return res.status(409).json({
        success: false,
        message: "Only accepted orders can be completed",
      });
    }

    // ── 3b. delivery charge finalized? ─────────────────────────
    if (order.deliveryCharge == null) {
      return res.status(409).json({
        success: false,
        message: "Delivery charge not yet finalized — waiting for vendor assignment",
      });
    }

    // ── 4. payment already verified for this order? ────────────
    const existingVerified = await paymentModel.findOne({
      orderId: order._id,
      status: { $in: ["payment_verified", "cash_recorded"] },
    });
    if (existingVerified) {
      return res.status(409).json({
        success: false,
        message: "Payment already recorded for this order",
      });
    }

    // ── 4b. cancel any active payment in progress ──────────────
    const activePayment = await paymentModel.findOne({
      orderId: order._id,
      status: { $in: ["created", "qr_generated", "awaiting_payment"] },
    });
    if (activePayment) {
      activePayment.status = "cancelled";
      activePayment.activeAttempt = null;
      await activePayment.save();
    }

    // ── 5. calculate authoritative amount ──────────────────────
    const amount = computeAmount(order);

    // ── 6. calculate cash handling fee ─────────────────────────
    // The company recovers the order's additional charges from the vendor's
    // next non-cash settlement. Uses the same order.additionalCharges source
    // as computeAmount()/calculateSettlementAmounts() so all paths agree.
    const cashHandlingFee = Math.round(Number(order.additionalCharges) * 100) / 100;

    // ── 7. create cash payment record ──────────────────────────
    const merchantRef = makeMerchantRef(order._id);

    const payment = await paymentModel.create({
      orderId: order._id,
      customerId: order.user._id,
      vendorId: req.account._id,
      provider: "cash",
      merchantReference: merchantRef,
      amountExpected: amount,
      amountReceived: amount,
      status: "cash_recorded",
      cashHandlingFee,
      cashFeeDeducted: false,
      paidAt: new Date(),
      verifiedAt: new Date(),
    });

    // ── 8. update order payment status ────────────────────────
    order.paymentStatus = "completed";
    order.paymentMethod = "cash";
    await order.save();

    // ── 9. return to frontend ─────────────────────────────────
    res.json({
      success: true,
      message: "Cash payment recorded successfully",
      data: {
        paymentId: payment._id,
        provider: "cash",
        amount: payment.amountExpected,
        reference: payment.merchantReference,
        status: payment.status,
        cashHandlingFee: payment.cashHandlingFee,
      },
    });
  } catch (error) {
    console.error("Cash payment error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to record cash payment" });
  }
};

/**
 * POST /api/vendors/payments/cancel/:orderId
 *
 * Cancel an active payment for an order.
 * Resets the payment status so a new payment can be initiated.
 */
export const cancelPayment = async (req, res) => {
  try {
    const order = await orderModel.findById(req.params.orderId);

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (String(order.vendor) !== String(req.account._id)) {
      return res.status(403).json({
        success: false,
        message: "This order is not assigned to you",
      });
    }

    // Find and cancel any active payment
    const activePayment = await paymentModel.findOne({
      orderId: order._id,
      status: { $in: ["created", "qr_generated", "awaiting_payment"] },
    });

    if (activePayment) {
      activePayment.status = "cancelled";
      activePayment.activeAttempt = null;
      await activePayment.save();
    }

    // Reset order payment status
    order.paymentStatus = "unpaid";
    order.paymentMethod = null;
    await order.save();

    res.json({
      success: true,
      message: "Payment cancelled successfully",
    });
  } catch (error) {
    console.error("Cancel payment error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to cancel payment" });
  }
};

/**
 * POST /api/vendors/payments/revoke-cash/:orderId
 *
 * Revoke a cash payment and allow the vendor to select QR payment instead.
 * This can only be done for cash_recorded payments.
 */
export const revokeCashPayment = async (req, res) => {
  try {
    const order = await orderModel.findById(req.params.orderId);

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (String(order.vendor) !== String(req.account._id)) {
      return res.status(403).json({
        success: false,
        message: "This order is not assigned to you",
      });
    }

    // Find the cash payment
    const cashPayment = await paymentModel.findOne({
      orderId: order._id,
      provider: "cash",
      status: "cash_recorded",
    });

    if (!cashPayment) {
      return res.status(404).json({
        success: false,
        message: "No cash payment found for this order",
      });
    }

    // Mark cash payment as cancelled
    cashPayment.status = "cancelled";
    cashPayment.activeAttempt = null;
    await cashPayment.save();

    // Reset order payment status
    order.paymentStatus = "unpaid";
    order.paymentMethod = null;
    await order.save();

    res.json({
      success: true,
      message: "Cash payment revoked. You can now select QR payment.",
    });
  } catch (error) {
    console.error("Revoke cash payment error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to revoke cash payment" });
  }
};

/**
 * GET /api/vendors/payments/status/:paymentId
 *
 * Vendor polls for payment status (called while "waiting for payment" screen).
 */
export const getPaymentStatus = async (req, res) => {
  try {
    const payment = await paymentModel.findById(req.params.paymentId);

    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    // only the vendor assigned to this order can check status
    if (String(payment.vendorId) !== String(req.account._id)) {
      return res.status(403).json({
        success: false,
        message: "Not authorised to check this payment",
      });
    }

    // Lazy expiry (Phase 8A audit §J / §P-5): report a deterministic
    // `payment_expired` instead of a stale active status while the MongoDB
    // TTL monitor sweep (up to ~60 s) has not yet removed the document.
    await lazyExpirePayment(payment);

    res.json({
      success: true,
      data: {
        paymentId: payment._id,
        provider: payment.provider,
        amount: payment.amountExpected,
        status: payment.status,
        expiresAt: payment.expiresAt,
        paidAt: payment.paidAt,
        verifiedAt: payment.verifiedAt,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to check payment status" });
  }
};

// ════════════════════════════════════════════════════════════════
//  PAYMENT CALLBACK & VERIFICATION
// ════════════════════════════════════════════════════════════════

/**
 * Load the commission configuration (singleton).
 * Returns the existing config or creates a default one.
 */
const loadCommissionConfig = async () => {
  let config = await commissionConfigModel.findOne();
  if (!config) {
    config = await commissionConfigModel.create({
      companyFeeType: "fixed",
      deliveryCharge: 50,
      additionalCharges: 15,
      commissionPercentage: 0,
      minimumCommission: 0,
    });
  }
  return config;
};

/**
 * Calculate settlement amounts based on the commission configuration.
 *
 * When companyFeeType is "fixed":
 *   companyAmount = deliveryCharge + additionalCharges
 *   vendorAmount  = goodsAmount
 *
 * When companyFeeType is "percent":
 *   companyAmount = max(commissionPercentage % of goodsAmount, minimumCommission)
 *   vendorAmount  = goodsAmount - companyAmount
 *
 * In both cases:
 *   customerPaymentAmount = goodsAmount + deliveryCharge + additionalCharges
 */
const calculateSettlementAmounts = (order, config) => {
  const goodsAmount = Number(order.subtotal);
  const deliveryAmount = Number(order.deliveryCharge ?? 0);
  const additionalChargesAmount = Number(order.additionalCharges);

  let companyAmount;
  let vendorAmount;

  if (config.companyFeeType === "percent") {
    const rawCommission = Math.round((goodsAmount * config.commissionPercentage) / 100 * 100) / 100;
    const commission = Math.max(rawCommission, config.minimumCommission);
    companyAmount = deliveryAmount + additionalChargesAmount + commission;
    vendorAmount = Math.max(0, goodsAmount - commission);
  } else {
    companyAmount = deliveryAmount + additionalChargesAmount;
    vendorAmount = goodsAmount;
  }

  const customerPaymentAmount = goodsAmount + deliveryAmount + additionalChargesAmount;

  return {
    goodsAmount,
    deliveryAmount,
    additionalChargesAmount,
    companyAmount,
    vendorAmount,
    customerPaymentAmount,
  };
};

/**
 * Deduct outstanding cash handling fees from a settlement's available vendor
 * payout.
 *
 * Strategy: whole-record atomic, oldest first (per FIN-001). For each
 * outstanding cash-order fee record (still awaiting deduction), fully deduct
 * it when the remaining payout balance fully covers it; records that do not
 * fully fit are left untouched and carried forward to the next settlement.
 * Each record is claimed atomically (findOneAndUpdate with a
 * cashFeeDeducted:false guard) so a record can never be deducted twice, not
 * even under concurrent settlement creation for the same vendor.
 *
 * @param {ObjectId} vendorId the vendor being settled
 * @param {number}   available the settlement's vendorAmount before clawback
 * @returns {Promise<{deductedAmount: number, claimedIds: ObjectId[]>}>}
 */
const deductOutstandingCashFees = async (vendorId, available) => {
  const pending = await paymentModel
    .find({
      vendorId,
      provider: "cash",
      status: "cash_recorded",
      cashFeeDeducted: false,
      cashHandlingFee: { $gt: 0 },
    })
    .sort({ createdAt: 1 });

  let deductedAmount = 0;
  const claimedIds = [];

  for (const record of pending) {
    const fee = Number(record.cashHandlingFee) || 0;
    if (fee <= 0 || fee > available - deductedAmount) continue; // carry forward untouched

    // Atomic claim: only the winner of this update gets to count the fee.
    const claimed = await paymentModel.findOneAndUpdate(
      { _id: record._id, cashFeeDeducted: false },
      { $set: { cashFeeDeducted: true } },
      { returnDocument: "after" }
    );
    if (claimed) {
      deductedAmount = Math.round((deductedAmount + fee) * 100) / 100;
      claimedIds.push(claimed._id);
    }
  }

  return { deductedAmount, claimedIds };
};

/**
 * Create a settlement record for a verified payment.
 *
 * Snapshots the vendor's payout destination at creation time so
 * future changes to vendor payout details do not alter historical
 * settlements.
 *
 * Uses the commission configuration to calculate amounts.
 * Outstanding cash-order handling fees for the same vendor are clawed back
 * from vendorAmount here, and the deducted total is recorded on the
 * settlement (cashFeesDeducted). Claims are rolled back if settlement
 * creation fails so a fee is only ever marked deducted when a persisted
 * settlement actually withheld it.
 * Updates the company account ledger.
 *
 * @param {Object} payment   – verified payment document
 * @param {Object} order     – order document
 * @returns {Promise<Object>} created settlement document
 */
const createSettlement = async (payment, order) => {
  const [vendor, config] = await Promise.all([
    vendorModel.findById(order.vendor),
    loadCommissionConfig(),
  ]);

  const amounts = calculateSettlementAmounts(order, config);

  const { deductedAmount, claimedIds } = await deductOutstandingCashFees(
    order.vendor,
    amounts.vendorAmount
  );
  const finalVendorAmount = Math.max(0, amounts.vendorAmount - deductedAmount);

  let settlement;
  try {
    settlement = await settlementModel.create({
      orderId: order._id,
      vendorId: order.vendor,
      paymentId: payment._id,
      customerPaymentAmount: amounts.customerPaymentAmount,
      goodsAmount: amounts.goodsAmount,
      deliveryAmount: amounts.deliveryAmount,
      additionalChargesAmount: amounts.additionalChargesAmount,
      companyAmount: amounts.companyAmount,
      vendorAmount: finalVendorAmount,
      cashFeesDeducted: deductedAmount,
      payoutDestination: {
        method: vendor?.payoutMethod || null,
        bankName: vendor?.payoutBankName || null,
        accountNumber: vendor?.payoutAccountNumber || null,
        accountHolder: vendor?.payoutAccountHolder || null,
      },
      status: "pending",
    });
  } catch (error) {
    // Settlement not persisted — restore the claimed records so the fees
    // stay available for a later settlement. No money was mis-recorded.
    if (claimedIds.length > 0) {
      await paymentModel.updateMany(
        { _id: { $in: claimedIds }, cashFeeDeducted: true },
        { $set: { cashFeeDeducted: false } }
      );
    }
    throw error;
  }

  // Update company account ledger
  let account = await companyAccountModel.findOne();
  if (!account) {
    account = await companyAccountModel.create({ name: "Dokko Company Account" });
  }
  account.collectedAmount += amounts.companyAmount;
  account.totalSettlements += 1;
  account.pendingPayouts += 1;
  await account.save();

  return settlement;
};

/**
 * Core verification + completion logic.
 *
 * Called after a callback is received and parsed. Handles:
 *   1. Idempotency — already verified or completed payments are skipped
 *   2. Amount validation — gateway amount must match server-computed amount
 *   3. Reference validation — transaction must belong to the correct order
 *   4. Provider verification — calls provider's server-side verify API
 *   5. Payment status update
 *   6. Settlement creation
 *   7. Order paymentStatus update
 *
 * @param {Object}  opts
 * @param {string}  opts.providerName              – "mock" | "fonepay"
 * @param {string}  opts.providerTransactionId     – gateway's transaction ID
 * @param {number|null} opts.amountReceived        – amount from gateway callback
 * @param {string}  opts.merchantRef               – our merchant reference
 * @param {Object}  opts.rawPayload                – raw callback data for audit
 * @returns {Promise<{status: string, payment: Object}>}
 */
const verifyAndCompletePayment = async ({
  providerName,
  providerTransactionId,
  amountReceived,
  merchantRef,
  rawPayload,
}) => {
  // ── 1. Find payment by merchant reference ───────────────────
  const payment = await paymentModel.findOne({ merchantReference: merchantRef });

  if (!payment) {
    return { status: "not_found", payment: null };
  }

  // ── 2. Idempotency — already verified or failed? ───────────
  // activeAttempt is defensively cleared here too: a terminal record must
  // never hold activeAttempt="active", or its partial-unique-index entry
  // would additionally block any brand-new active payment for the order.
  if (payment.status === "payment_verified") {
    if (payment.activeAttempt) {
      payment.activeAttempt = null;
      await payment.save();
    }
    return { status: "already_verified", payment };
  }

  if (payment.status === "payment_failed" || payment.status === "payment_expired") {
    if (payment.activeAttempt) {
      payment.activeAttempt = null;
      await payment.save();
    }
    return { status: "terminal", payment };
  }

  // ── 3. Check payment hasn't expired ────────────────────────
  if (payment.expiresAt && payment.expiresAt < new Date()) {
    payment.status = "payment_expired";
    payment.failureReason = "Payment expired before callback received";
    payment.activeAttempt = null;
    await payment.save();
    return { status: "expired", payment };
  }

  // ── 4. Load the order for amount computation ───────────────
  const order = await orderModel.findById(payment.orderId);

  if (!order) {
    payment.status = "payment_failed";
    payment.failureReason = "Order no longer exists";
    payment.activeAttempt = null;
    await payment.save();
    return { status: "order_missing", payment };
  }

  // ── 4b. Order state-machine guard (Phase 8A audit §D / §P-7) ──
  // Reject verification when the order is in a state where money must not
  // be recorded (Delivered/Cancelled) or where money is ALREADY recorded
  // (paid = digital verified, completed = cash, refunded). Because step 2
  // short-circuits already-verified payments, any verification that reaches
  // this point on a fully-settled order is for a DIFFERENT provider/attempt
  // — granting it would double-collect. The payment is failed instead.
  const orderAlreadySettled = ["paid", "completed", "refunded"].includes(
    order.paymentStatus
  );
  if (order.status === "Delivered" || order.status === "Cancelled" || orderAlreadySettled) {
    payment.status = "payment_failed";
    payment.failureReason = orderAlreadySettled
      ? "Payment already recorded for this order"
      : `Order is ${order.status} — payment can no longer be verified`;
    payment.activeAttempt = null;
    await payment.save();
    return { status: "state_invalid", payment };
  }

  // ── 5. Set provider transaction ID (for first callback) ────
  if (!payment.providerTransactionId && providerTransactionId) {
    payment.providerTransactionId = providerTransactionId;
  }

  // Store raw payload for audit trail
  payment.providerPayload = rawPayload;

  // ── 6. Amount validation ──────────────────────────────────
  // Gateway-reported amount must match server-computed amount.
  // Some providers may not report amount in the callback (null),
  // in which case we skip this check and rely on verifyPayment().
  const provider = getProviderByName(providerName);

  if (amountReceived !== null && amountReceived !== undefined) {
    const expected = payment.amountExpected;
    const actual = Number(amountReceived);

    if (!provider.validateAmount(expected, actual)) {
      payment.status = "amount_mismatch";
      payment.amountReceived = actual;
      payment.failureReason = `Amount mismatch: expected ${expected}, received ${actual}`;
      payment.activeAttempt = null;
      await payment.save();
      return { status: "amount_mismatch", payment };
    }

    payment.amountReceived = actual;
  }

  // ── 7. Provider-side verification ─────────────────────────

  let verification;
  try {
    verification = await provider.verifyPayment(payment);
  } catch (verifyErr) {
    // Gateway unavailable — mark as received but not verified.
    // The vendor can retry verification later via status poll.
    // payment_received is NOT an active attempt anymore — retryable only by
    // verification — so activeAttempt drops back to null.
    payment.status = "payment_received";
    payment.failureReason = `Gateway verification failed: ${verifyErr.message}`;
    payment.activeAttempt = null;
    await payment.save();
    return { status: "gateway_unavailable", payment };
  }

  if (!verification.verified) {
    payment.status = "payment_failed";
    payment.failureReason = "Provider verification failed";
    payment.amountReceived = verification.amountReceived || null;
    payment.activeAttempt = null;
    await payment.save();
    return { status: "verification_failed", payment };
  }

  // ── 8. Final amount check from verification response ──────
  if (verification.amountReceived !== undefined && verification.amountReceived !== null) {
    if (!provider.validateAmount(payment.amountExpected, verification.amountReceived)) {
      payment.status = "amount_mismatch";
      payment.amountReceived = verification.amountReceived;
      payment.failureReason = `Amount mismatch after verification: expected ${payment.amountExpected}, got ${verification.amountReceived}`;
      payment.activeAttempt = null;
      await payment.save();
      return { status: "amount_mismatch", payment };
    }
    payment.amountReceived = verification.amountReceived;
  }

  // ── 9. Mark payment as verified ───────────────────────────
  payment.status = "payment_verified";
  payment.paidAt = payment.paidAt || new Date();
  payment.verifiedAt = new Date();
  payment.failureReason = null;
  payment.activeAttempt = null;
  await payment.save();

  // ── 10. Update order paymentStatus ────────────────────────
  order.paymentStatus = "paid";
  await order.save();

  // ── 11. Create settlement (idempotent — unique index on orderId) ──
  try {
    await createSettlement(payment, order);
  } catch (settlementErr) {
    // Duplicate key error means settlement already exists — that's fine.
    // Any other error is logged but does not fail the payment.
    if (settlementErr.code !== 11000) {
      console.error("Settlement creation failed:", settlementErr.message);
    }
  }

  return { status: "verified", payment };
};

// ════════════════════════════════════════════════════════════════
//  PAYMENT CALLBACK & VERIFICATION
// Development-only action. It still uses the same provider verification and
// order-completion pipeline; it is not a client-controlled "mark paid" API.
export const completeMockPayment = async (req, res) => {
  try {
    const payment = await paymentModel.findById(req.params.paymentId);
    if (!payment || payment.provider !== "mock") return res.status(404).json({ success: false, message: "Mock payment not found" });
    if (String(payment.vendorId) !== String(req.account._id)) return res.status(403).json({ success: false, message: "Not authorised to simulate this payment" });
    const provider = getProviderByName("mock");
    const callback = await provider.handleCallback({ payment });
    const result = await verifyAndCompletePayment({ providerName: "mock", providerTransactionId: callback.providerTransactionId, amountReceived: callback.amountReceived, merchantRef: callback.reference, rawPayload: callback.raw });
    return res.status(["verified", "already_verified"].includes(result.status) ? 200 : 400).json({ success: ["verified", "already_verified"].includes(result.status), message: `Mock verification result: ${result.status}` });
  } catch (error) {
    return res.status(403).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/vendors/payments/verify/:paymentId
 *
 * Vendor-initiated verification. Called when the vendor's UI polls
 * for status and wants to trigger server-side verification.
 *
 * This ensures payment success is NEVER determined by frontend redirect
 * alone — the backend always verifies with the gateway.
 */
export const triggerVerification = async (req, res) => {
  try {
    const payment = await paymentModel.findById(req.params.paymentId);

    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    // Only the vendor assigned to this order can trigger verification
    if (String(payment.vendorId) !== String(req.account._id)) {
      return res.status(403).json({
        success: false,
        message: "Not authorised to verify this payment",
      });
    }

    // Already verified — return success
    if (payment.status === "payment_verified") {
      return res.json({
        success: true,
        message: "Payment already verified",
        data: { paymentId: payment._id, status: payment.status },
      });
    }

    // Terminal states — cannot verify
    if (["payment_failed", "payment_expired", "cancelled", "amount_mismatch"].includes(payment.status)) {
      return res.status(409).json({
        success: false,
        message: `Payment is in terminal state: ${payment.status}`,
      });
    }

    // Must have a provider transaction ID to verify
    if (!payment.providerTransactionId) {
      return res.status(400).json({
        success: false,
        message: "No provider transaction to verify yet",
      });
    }

    const result = await verifyAndCompletePayment({
      providerName: payment.provider,
      providerTransactionId: payment.providerTransactionId,
      amountReceived: null, // let verifyPayment() determine the amount
      merchantRef: payment.merchantReference,
      rawPayload: { triggeredBy: "vendor", paymentId: payment._id },
    });

    res.json({
      success: ["verified", "already_verified"].includes(result.status),
      message: result.status === "verified"
        ? "Payment verified successfully"
        : result.status === "already_verified"
          ? "Payment was already verified"
          : `Verification result: ${result.status}`,
      data: {
        paymentId: payment._id,
        status: result.payment?.status || payment.status,
      },
    });
  } catch (error) {
    console.error("Verification trigger error:", error);
    res.status(500).json({ success: false, message: "Failed to verify payment" });
  }
};

// ── exports for testing and reuse ────────────────────────────
export { loadCommissionConfig, calculateSettlementAmounts };
