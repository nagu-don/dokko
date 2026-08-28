import mongoose from "mongoose";

/**
 * Commission / fee configuration.
 *
 * Only ONE document should exist in this collection (singleton pattern).
 * Admins update it via an API endpoint; the settlement calculation reads it.
 *
 * Two fee types are supported:
 *   - fixed: a flat NPR amount per order (current model: delivery=50, additional=15)
 *   - percent: a percentage of the goods subtotal
 *
 * companyFeeType determines which formula is used when computing companyAmount.
 */
const commissionConfigSchema = new mongoose.Schema(
  {
    // "fixed" | "percent"
    companyFeeType: {
      type: String,
      enum: ["fixed", "percent"],
      default: "fixed",
    },

    // ── fixed-fee fields ──────────────────────────────────────
    deliveryCharge: { type: Number, required: true, default: 50, min: 0 },
    additionalCharges: { type: Number, required: true, default: 15, min: 0 },

    // ── percent-fee fields ────────────────────────────────────
    // commissionPercentage is applied to the goods subtotal
    // e.g. 10 means the company keeps 10 % of goodsAmount
    commissionPercentage: { type: Number, default: 0, min: 0, max: 100 },

    // ── optional: minimum commission floor (NPR) when using percent mode ──
    minimumCommission: { type: Number, default: 0, min: 0 },

    // ── human-readable label / admin note ──────────────────────
    description: { type: String, default: "", trim: true },

    // ── who last changed this config ──────────────────────────
    lastEditedByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "admin",
      default: null,
    },
  },
  { timestamps: true }
);

const commissionConfigModel =
  mongoose.models.commissionConfig ||
  mongoose.model("commissionConfig", commissionConfigSchema);

export default commissionConfigModel;
