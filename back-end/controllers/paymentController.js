import crypto from "node:crypto";
import mongoose from "mongoose";
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

/**
 * POST /api/vendors/payments/initiate/:orderId
 *
 * Vendor initiates a digital payment for an accepted order.
 *
 * Steps:
 *   1. Verify vendor auth (done by middleware)
 *   2. Verify order exists
 *   3. Verify order belongs to this vendor
 *   4. Verify order is in "Processing" state
 *   5. Calculate authoritative amount
 *   6. Check for duplicate (already has active payment)
 *   7. Create Payment record
 *   8. Generate provider payment request (QR / redirect)
 *   9. Return payment data to frontend
 */
export const initiatePayment = async (req, res) => {
  try {
    // ── 1. vendor auth is handled by authVendor middleware ─────

    // ── 2. order exists? ───────────────────────────────────────
    const order = await orderModel
      .findById(req.params.orderId)
      .populate("user", "name email phone");

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // ── 3. order belongs to this vendor? ───────────────────────
    if (String(order.vendor) !== String(req.account._id)) {
      return res.status(403).json({
        success: false,
        message: "This order is not assigned to you",
      });
    }

    // ── 4. order in correct state? ─────────────────────────────
    if (order.status !== "Processing") {
      return res.status(409).json({
        success: false,
        message: "Only accepted orders can be completed",
      });
    }

    // ── 4b. delivery charge finalized? ─────────────────────────
    // deliveryCharge is null while the priority search is in
    // progress.  Payment must not proceed until a vendor has
    // accepted and the charge is known.
    if (order.deliveryCharge == null) {
      return res.status(409).json({
        success: false,
        message: "Delivery charge not yet finalized — waiting for vendor assignment",
      });
    }

    // ── 5. payment already verified for this order? ────────────
    const existingVerified = await paymentModel.findOne({
      orderId: order._id,
      status: "payment_verified",
    });
    if (existingVerified) {
      return res.status(409).json({
        success: false,
        message: "Payment already verified for this order",
      });
    }

    // ── 6. active payment already in progress? ─────────────────
    const activePayment = await paymentModel.findOne({
      orderId: order._id,
      status: { $in: ["created", "qr_generated", "awaiting_payment"] },
    });
    if (activePayment) {
      // return the existing payment — no duplicate creation
      return res.json({
        success: true,
        message: "Payment already in progress",
        data: formatPaymentResponse(activePayment),
      });
    }

    // ── 7. select provider ─────────────────────────────────────
    const { provider: requestedProvider } = req.body;
    const gatewayStatus = getGatewayStatus();

    if (!gatewayStatus.isReady) {
      if ((requestedProvider || gatewayStatus.activeProvider) === "nepalpay") {
        return res.status(503).json({ success: false, message: "NEPALPAY/NCHL payment configuration is incomplete. An acquiring-bank/NCHL merchant configuration is required." });
      }
      return res.status(503).json({
        success: false,
        message: "Payment gateway is not configured",
      });
    }

    const providerName = requestedProvider || gatewayStatus.activeProvider;

    if (!gatewayStatus.availableProviders.includes(providerName)) {
      return res.status(400).json({
        success: false,
        message: `Payment provider "${providerName}" is not available`,
      });
    }

    // ── 8. calculate authoritative amount ──────────────────────
    const amount = computeAmount(order);

    // ── 8b. check for pending cash handling fees ───────────────
    // If vendor has unpaid cash handling fees, track them for settlement deduction
    const pendingCashFees = await paymentModel.aggregate([
      {
        $match: {
          vendorId: req.account._id,
          provider: "cash",
          cashFeeDeducted: false,
          cashHandlingFee: { $gt: 0 },
        },
      },
      {
        $group: {
          _id: null,
          totalCashFees: { $sum: "$cashHandlingFee" },
        },
      },
    ]);

    const totalPendingCashFees = pendingCashFees[0]?.totalCashFees || 0;

    // ── 9. create payment record ───────────────────────────────
    const merchantRef = makeMerchantRef(order._id);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    const payment = await paymentModel.create({
      orderId: order._id,
      customerId: order.user._id,
      vendorId: req.account._id,
      provider: providerName,
      merchantReference: merchantRef,
      amountExpected: amount,
      status: "created",
      expiresAt,
    });

    // ── 10. update order payment status ────────────────────────
    order.paymentStatus = "pending";
    order.paymentMethod = providerName;
    await order.save();

    // ── 11. call provider to generate QR / redirect ────────────
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
      await payment.save();

      order.paymentStatus = "unpaid";
      order.paymentMethod = null;
      await order.save();

      return res.status(502).json({
        success: false,
        message: "Payment provider error. Please try again.",
      });
    }

    // ── 12. update payment status ──────────────────────────────
    payment.status = providerResult.qrData ? "qr_generated" : "awaiting_payment";
    payment.qrReference = providerResult.qrReference || null;
    await payment.save();

    // ── 13. return to frontend ─────────────────────────────────
    res.json({
      success: true,
      message: "Payment initiated",
      data: formatPaymentResponse(payment, providerResult),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to initiate payment" });
  }
};

// ── shape the payment data for the frontend ────────────────────
// SECURITY: never include provider secrets, internal config, or raw payloads.
function formatPaymentResponse(payment, providerResult = null) {
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
    // Always show QR code (unified QR works with all Nepali payment apps)
    if (providerResult.qrData) {
      data.flow = "qr";
      data.qrData = providerResult.qrData;
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
      await activePayment.save();
    }

    // ── 5. calculate authoritative amount ──────────────────────
    const amount = computeAmount(order);

    // ── 6. calculate cash handling fee (5% of order total) ─────
    const cashHandlingFee = Math.round(amount * 0.05 * 100) / 100;

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
 * Create a settlement record for a verified payment.
 *
 * Snapshots the vendor's payout destination at creation time so
 * future changes to vendor payout details do not alter historical
 * settlements.
 *
 * Uses the commission configuration to calculate amounts.
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

  const settlement = await settlementModel.create({
    orderId: order._id,
    vendorId: order.vendor,
    paymentId: payment._id,
    customerPaymentAmount: amounts.customerPaymentAmount,
    goodsAmount: amounts.goodsAmount,
    deliveryAmount: amounts.deliveryAmount,
    additionalChargesAmount: amounts.additionalChargesAmount,
    companyAmount: amounts.companyAmount,
    vendorAmount: amounts.vendorAmount,
    payoutDestination: {
      method: vendor?.payoutMethod || null,
      bankName: vendor?.payoutBankName || null,
      accountNumber: vendor?.payoutAccountNumber || null,
      accountHolder: vendor?.payoutAccountHolder || null,
    },
    status: "pending",
  });

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
 * @param {string}  opts.providerName              – "nepalpay" | "mock"
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
  if (payment.status === "payment_verified") {
    return { status: "already_verified", payment };
  }

  if (payment.status === "payment_failed" || payment.status === "payment_expired") {
    return { status: "terminal", payment };
  }

  // ── 3. Check payment hasn't expired ────────────────────────
  if (payment.expiresAt && payment.expiresAt < new Date()) {
    payment.status = "payment_expired";
    payment.failureReason = "Payment expired before callback received";
    await payment.save();
    return { status: "expired", payment };
  }

  // ── 4. Load the order for amount computation ───────────────
  const order = await orderModel.findById(payment.orderId);

  if (!order) {
    payment.status = "payment_failed";
    payment.failureReason = "Order no longer exists";
    await payment.save();
    return { status: "order_missing", payment };
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
    payment.status = "payment_received";
    payment.failureReason = `Gateway verification failed: ${verifyErr.message}`;
    await payment.save();
    return { status: "gateway_unavailable", payment };
  }

  if (!verification.verified) {
    payment.status = "payment_failed";
    payment.failureReason = "Provider verification failed";
    payment.amountReceived = verification.amountReceived || null;
    await payment.save();
    return { status: "verification_failed", payment };
  }

  // ── 8. Final amount check from verification response ──────
  if (verification.amountReceived !== undefined && verification.amountReceived !== null) {
    if (!provider.validateAmount(payment.amountExpected, verification.amountReceived)) {
      payment.status = "amount_mismatch";
      payment.amountReceived = verification.amountReceived;
      payment.failureReason = `Amount mismatch after verification: expected ${payment.amountExpected}, got ${verification.amountReceived}`;
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
  await payment.save();

  // ── 9b. Mark pending cash fees as deducted ──────────────────
  // When a QR payment is verified, mark any pending cash handling fees
  // for this vendor as deducted (they'll be subtracted from settlement)
  await paymentModel.updateMany(
    {
      vendorId: payment.vendorId,
      provider: "cash",
      cashFeeDeducted: false,
    },
    { $set: { cashFeeDeducted: true } }
  );

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
