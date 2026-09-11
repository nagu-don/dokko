import mongoose from "mongoose";
import settlementModel from "../models/settlementModel.js";
import companyAccountModel from "../models/companyAccountModel.js";
import commissionConfigModel from "../models/commissionConfigModel.js";
import orderModel from "../models/orderModel.js";
import vendorModel from "../models/vendorModel.js";
import paymentModel from "../models/paymentModel.js";
import adminActivityModel from "../models/adminActivityModel.js";
import { decryptField, maskAccountNumber } from "../utils/fieldEncryption.js";
import logger from "../utils/logger.js";

const logAdminActivity = async (adminId, action, description = "", metadata = {}) => {
  try {
    await adminActivityModel.create({ adminId, action, description, metadata });
  } catch (err) {
    logger.error({ err }, "Failed to log admin activity");
  }
};

// Serialize a settlement for an API response with its payout destination
// account number masked (decrypting first if it was stored encrypted).
const presentSettlement = (settlement) => {
  const doc = settlement.toObject ? settlement.toObject() : { ...settlement };
  const accountNumber = doc.payoutDestination?.accountNumber;
  if (accountNumber) {
    doc.payoutDestination = {
      ...doc.payoutDestination,
      accountNumber: maskAccountNumber(decryptField(accountNumber)),
    };
  }
  return doc;
};

// ════════════════════════════════════════════════════════════════
//  COMMISSION CONFIGURATION (admin only)
// ════════════════════════════════════════════════════════════════

/**
 * GET /api/admins/commission-config
 *
 * Returns the current commission configuration.
 * Creates a default one if none exists.
 */
export const getCommissionConfig = async (req, res) => {
  try {
    let config = await commissionConfigModel.findOne();

    if (!config) {
      config = await commissionConfigModel.create({
        companyFeeType: "fixed",
        deliveryCharge: 50,
        additionalCharges: 15,
        commissionPercentage: 0,
        minimumCommission: 0,
        description: "Default commission configuration",
      });
    }

    res.json({ success: true, data: config });
  } catch (error) {
    logger.error({ err: error }, "Failed to load commission config");
    res.status(500).json({ success: false, message: "Failed to load commission config" });
  }
};

/**
 * PATCH /api/admins/commission-config
 *
 * Update the commission configuration.
 * Only admins can do this.
 */
export const updateCommissionConfig = async (req, res) => {
  try {
    const {
      companyFeeType,
      deliveryCharge,
      additionalCharges,
      commissionPercentage,
      minimumCommission,
      description,
    } = req.body;

    let config = await commissionConfigModel.findOne();

    if (!config) {
      config = new commissionConfigModel();
    }

    if (companyFeeType !== undefined) {
      if (!["fixed", "percent"].includes(companyFeeType)) {
        return res.status(400).json({
          success: false,
          message: "companyFeeType must be 'fixed' or 'percent'",
        });
      }
      config.companyFeeType = companyFeeType;
    }

    if (deliveryCharge !== undefined) {
      const val = Number(deliveryCharge);
      if (!Number.isFinite(val) || val < 0) {
        return res.status(400).json({
          success: false,
          message: "deliveryCharge must be a non-negative number",
        });
      }
      config.deliveryCharge = val;
    }

    if (additionalCharges !== undefined) {
      const val = Number(additionalCharges);
      if (!Number.isFinite(val) || val < 0) {
        return res.status(400).json({
          success: false,
          message: "additionalCharges must be a non-negative number",
        });
      }
      config.additionalCharges = val;
    }

    if (commissionPercentage !== undefined) {
      const val = Number(commissionPercentage);
      if (!Number.isFinite(val) || val < 0 || val > 100) {
        return res.status(400).json({
          success: false,
          message: "commissionPercentage must be between 0 and 100",
        });
      }
      config.commissionPercentage = val;
    }

    if (minimumCommission !== undefined) {
      const val = Number(minimumCommission);
      if (!Number.isFinite(val) || val < 0) {
        return res.status(400).json({
          success: false,
          message: "minimumCommission must be a non-negative number",
        });
      }
      config.minimumCommission = val;
    }

    if (description !== undefined) {
      config.description = String(description);
    }

    config.lastEditedByAdminId = req.account._id;
    await config.save();

    res.json({ success: true, message: "Commission config updated", data: config });
  } catch (error) {
    logger.error({ err: error }, "Failed to update commission config");
    res.status(500).json({ success: false, message: "Failed to update commission config" });
  }
};

// ════════════════════════════════════════════════════════════════
//  SETTLEMENT MANAGEMENT (admin only)
// ════════════════════════════════════════════════════════════════

/**
 * GET /api/admins/settlements
 *
 * List settlements with optional filters.
 * Query params:
 *   - status: filter by settlement status
 *   - vendorId: filter by vendor
 *   - page: page number (default 1)
 *   - limit: results per page (default 20)
 */
export const listSettlements = async (req, res) => {
  try {
    const { status, vendorId, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (vendorId) filter.vendorId = vendorId;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [settlements, total] = await Promise.all([
      settlementModel
        .find(filter)
        .populate("vendorId", "name email phone")
        .populate("orderId", "total createdAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      settlementModel.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: settlements.map(presentSettlement),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to list settlements");
    res.status(500).json({ success: false, message: "Failed to list settlements" });
  }
};

/**
 * GET /api/admins/settlements/:id
 *
 * Get a single settlement by ID.
 */
export const getSettlement = async (req, res) => {
  try {
    const settlement = await settlementModel
      .findById(req.params.id)
      .populate("vendorId", "name email phone payoutMethod payoutBankName payoutAccountHolder")
      .populate("orderId", "total status createdAt user items")
      .populate("paymentId", "provider merchantReference amountExpected amountReceived paidAt verifiedAt")
      .populate("paidByAdminId", "name email");

    if (!settlement) {
      return res.status(404).json({ success: false, message: "Settlement not found" });
    }

    res.json({ success: true, data: presentSettlement(settlement) });
  } catch (error) {
    logger.error({ err: error }, "Failed to load settlement");
    res.status(500).json({ success: false, message: "Failed to load settlement" });
  }
};

/**
 * PATCH /api/admins/settlements/:id/approve
 *
 * Admin approves a pending settlement for payout.
 * Transitions: pending → approved
 */
export const approveSettlement = async (req, res) => {
  try {
    const settlement = await settlementModel.findById(req.params.id);

    if (!settlement) {
      return res.status(404).json({ success: false, message: "Settlement not found" });
    }

    if (settlement.status !== "pending") {
      return res.status(409).json({
        success: false,
        message: `Settlement is already ${settlement.status}, only pending settlements can be approved`,
      });
    }

    settlement.status = "approved";
    if (req.body.adminNote) {
      settlement.adminNote = req.body.adminNote;
    }
    await settlement.save();

    logAdminActivity(
      req.account._id,
      "approve_settlement",
      `Approved settlement ${settlement._id} (vendor amount: ${settlement.vendorAmount})`,
      { settlementId: settlement._id, vendorAmount: settlement.vendorAmount }
    );

    res.json({ success: true, message: "Settlement approved", data: presentSettlement(settlement) });
  } catch (error) {
    logger.error({ err: error }, "Failed to approve settlement");
    res.status(500).json({ success: false, message: "Failed to approve settlement" });
  }
};

/**
 * PATCH /api/admins/settlements/:id/pay
 *
 * Admin marks a settlement as paid (manual vendor disbursement).
 * Transitions: pending | approved → paid
 *
 * Records who paid it, when, and via which method.
 * Updates the company account ledger.
 */
export const markSettlementPaid = async (req, res) => {
  try {
    const settlement = await settlementModel.findById(req.params.id);

    if (!settlement) {
      return res.status(404).json({ success: false, message: "Settlement not found" });
    }

    if (!["pending", "approved"].includes(settlement.status)) {
      return res.status(409).json({
        success: false,
        message: `Settlement is already ${settlement.status}, cannot mark as paid`,
      });
    }

    const { payoutMethod, payoutReference, adminNote } = req.body;

    settlement.status = "paid";
    settlement.paidByAdminId = req.account._id;
    settlement.paidAt = new Date();
    if (payoutMethod) settlement.payoutMethod = payoutMethod;
    if (payoutReference) settlement.payoutReference = payoutReference;
    if (adminNote) settlement.adminNote = adminNote;
    await settlement.save();

    // Update company account ledger atomically
    const result = await companyAccountModel.findOneAndUpdate(
      {},
      {
        $inc: { disbursedAmount: settlement.vendorAmount, pendingPayouts: -1 },
        $setOnInsert: { name: "Dokko Company Account" },
      },
      { upsert: true, new: true }
    );
    if (result.pendingPayouts < 0) {
      await companyAccountModel.updateOne({}, { $set: { pendingPayouts: 0 } });
    }

    logAdminActivity(
      req.account._id,
      "mark_settlement_paid",
      `Marked settlement ${settlement._id} as paid (vendor amount: ${settlement.vendorAmount})`,
      { settlementId: settlement._id, vendorAmount: settlement.vendorAmount }
    );

    res.json({ success: true, message: "Settlement marked as paid", data: presentSettlement(settlement) });
  } catch (error) {
    logger.error({ err: error }, "Failed to mark settlement as paid");
    res.status(500).json({ success: false, message: "Failed to mark settlement as paid" });
  }
};

/**
 * PATCH /api/admins/settlements/:id/cancel
 *
 * Cancel a settlement that hasn't been paid yet.
 * Transitions: pending | approved → cancelled
 */
export const cancelSettlement = async (req, res) => {
  try {
    const settlement = await settlementModel.findById(req.params.id);

    if (!settlement) {
      return res.status(404).json({ success: false, message: "Settlement not found" });
    }

    if (!["pending", "approved"].includes(settlement.status)) {
      return res.status(409).json({
        success: false,
        message: `Settlement is already ${settlement.status}, cannot cancel`,
      });
    }

    settlement.status = "cancelled";
    if (req.body.adminNote) {
      settlement.adminNote = req.body.adminNote;
    }
    await settlement.save();

    // Decrement pending count on company account atomically
    const result = await companyAccountModel.findOneAndUpdate(
      {},
      {
        $inc: { pendingPayouts: -1 },
        $setOnInsert: { name: "Dokko Company Account" },
      },
      { upsert: true, new: true }
    );
    if (result.pendingPayouts < 0) {
      await companyAccountModel.updateOne({}, { $set: { pendingPayouts: 0 } });
    }

    logAdminActivity(
      req.account._id,
      "cancel_settlement",
      `Cancelled settlement ${settlement._id} (vendor amount: ${settlement.vendorAmount})`,
      { settlementId: settlement._id, vendorAmount: settlement.vendorAmount }
    );

    res.json({ success: true, message: "Settlement cancelled", data: presentSettlement(settlement) });
  } catch (error) {
    logger.error({ err: error }, "Failed to cancel settlement");
    res.status(500).json({ success: false, message: "Failed to cancel settlement" });
  }
};

// ════════════════════════════════════════════════════════════════
//  COMPANY ACCOUNT (admin only)
// ════════════════════════════════════════════════════════════════

/**
 * GET /api/admins/company-account
 *
 * Returns the company's internal ledger.
 * Creates the singleton document if it doesn't exist.
 */
export const getCompanyAccount = async (req, res) => {
  try {
    let account = await companyAccountModel.findOne();

    if (!account) {
      account = await companyAccountModel.create({ name: "Dokko Company Account" });
    }

    const balance = account.collectedAmount - account.disbursedAmount;

    res.json({
      success: true,
      data: {
        id: account._id,
        name: account.name,
        collectedAmount: account.collectedAmount,
        disbursedAmount: account.disbursedAmount,
        balance,
        totalSettlements: account.totalSettlements,
        pendingPayouts: account.pendingPayouts,
        currency: account.currency,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to load company account");
    res.status(500).json({ success: false, message: "Failed to load company account" });
  }
};

/**
 * GET /api/admins/vendor-payables
 *
 * Shows total amounts owed to each vendor.
 * Query params:
 *   - vendorId: specific vendor
 *   - status: filter by settlement status (default: pending+approved)
 */
export const getVendorPayables = async (req, res) => {
  try {
    const { vendorId, status } = req.query;

    const statusFilter = status
      ? { status }
      : { status: { $in: ["pending", "approved"] } };

    const filter = { ...statusFilter };
    if (vendorId) filter.vendorId = vendorId;

    const payables = await settlementModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$vendorId",
          totalOwed: { $sum: "$vendorAmount" },
          settlementCount: { $sum: 1 },
          oldestSettlement: { $min: "$createdAt" },
        },
      },
      {
        $lookup: {
          from: "vendors",
          localField: "_id",
          foreignField: "_id",
          as: "vendor",
        },
      },
      { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          vendorId: "$_id",
          vendorName: "$vendor.name",
          vendorEmail: "$vendor.email",
          totalOwed: 1,
          settlementCount: 1,
          oldestSettlement: 1,
          payoutMethod: "$vendor.payoutMethod",
          payoutBankName: "$vendor.payoutBankName",
          payoutAccountHolder: "$vendor.payoutAccountHolder",
        },
      },
      { $sort: { totalOwed: -1 } },
    ]);

    res.json({ success: true, data: payables });
  } catch (error) {
    logger.error({ err: error }, "Failed to load vendor payables");
    res.status(500).json({ success: false, message: "Failed to load vendor payables" });
  }
};

/**
 * GET /api/admins/cash-transactions
 *
 * Returns all cash payment transactions with their handling fees.
 * Supports filtering by vendor and date range.
 */
export const getCashTransactions = async (req, res) => {
  try {
    const { vendorId, startDate, endDate, status } = req.query;

    const match = { provider: "cash" };

    if (vendorId) {
      match.vendorId = new mongoose.Types.ObjectId(vendorId);
    }

    if (status === "pending") {
      match.cashFeeDeducted = false;
    } else if (status === "deducted") {
      match.cashFeeDeducted = true;
    }

    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }

    const transactions = await paymentModel.aggregate([
      { $match: match },
      {
        $lookup: {
          from: "vendors",
          localField: "vendorId",
          foreignField: "_id",
          as: "vendor",
        },
      },
      { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "orders",
          localField: "orderId",
          foreignField: "_id",
          as: "order",
        },
      },
      { $unwind: { path: "$order", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          paymentId: "$_id",
          orderId: 1,
          orderCode: "$order.code",
          vendorId: 1,
          vendorName: "$vendor.name",
          vendorEmail: "$vendor.email",
          amount: "$amountExpected",
          cashHandlingFee: 1,
          cashFeeDeducted: 1,
          status: 1,
          reference: "$merchantReference",
          paidAt: 1,
          createdAt: 1,
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    // Calculate summary statistics
    const summary = await paymentModel.aggregate([
      { $match: { provider: "cash" } },
      {
        $group: {
          _id: null,
          totalCashPayments: { $sum: 1 },
          totalCashAmount: { $sum: "$amountExpected" },
          totalHandlingFees: { $sum: "$cashHandlingFee" },
          pendingFees: {
            $sum: {
              $cond: [{ $eq: ["$cashFeeDeducted", false] }, "$cashHandlingFee", 0],
            },
          },
          deductedFees: {
            $sum: {
              $cond: [{ $eq: ["$cashFeeDeducted", true] }, "$cashHandlingFee", 0],
            },
          },
        },
      },
    ]);

    res.json({
      success: true,
      data: transactions,
      summary: summary[0] || {
        totalCashPayments: 0,
        totalCashAmount: 0,
        totalHandlingFees: 0,
        pendingFees: 0,
        deductedFees: 0,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to load cash transactions");
    res.status(500).json({ success: false, message: "Failed to load cash transactions" });
  }
};
