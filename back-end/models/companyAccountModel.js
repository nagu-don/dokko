import mongoose from "mongoose";

/**
 * Company account — a singleton document that tracks the company's
 * internal funds held from verified customer payments.
 *
 * Every time a settlement is created, the company's collectedAmount
 * increases by the companyAmount of that settlement.
 *
 * When the admin manually pays a vendor (marks a settlement as "paid"),
 * the company's disbursedAmount increases by the vendorAmount.
 *
 * balance = collectedAmount - disbursedAmount
 *
 * This is an INTERNAL ledger, not a real bank account.  It represents
 * the company's obligation to hold collected fees and its obligation
 * to disburse vendor payables.
 */
const companyAccountSchema = new mongoose.Schema(
  {
    // human-readable label (default "Dokko Company Account")
    name: { type: String, default: "Dokko Company Account", trim: true },

    // total company fees collected from all settlements
    collectedAmount: { type: Number, default: 0, min: 0 },

    // total vendor amounts disbursed (admin marks settlement as paid)
    disbursedAmount: { type: Number, default: 0, min: 0 },

    // computed on read: collectedAmount - disbursedAmount
    // (not stored, always derived)

    // total number of settlements processed
    totalSettlements: { type: Number, default: 0, min: 0 },

    // number of settlements still pending payout to vendors
    pendingPayouts: { type: Number, default: 0, min: 0 },

    currency: { type: String, default: "NPR", immutable: true },
  },
  { timestamps: true }
);

// singleton: only one company account should exist
companyAccountSchema.index({ name: 1 }, { unique: true });

const companyAccountModel =
  mongoose.models.companyAccount ||
  mongoose.model("companyAccount", companyAccountSchema);

export default companyAccountModel;
