import mongoose from 'mongoose'

const SETTLEMENT_STATUSES = ["pending", "approved", "paid", "failed", "cancelled"];

const payoutSnapshotSchema = new mongoose.Schema({
    // payout method at the time the settlement was created
    method: {type: String, default: null},
    // bank details (snapshot from vendor at time of settlement)
    bankName: {type: String, default: null, trim: true},
    accountNumber: {type: String, default: null, trim: true},
    accountHolder: {type: String, default: null, trim: true}
}, {_id: false});

const settlementSchema = new mongoose.Schema({
    // ── links ──────────────────────────────────────────────────
    orderId: {type: mongoose.Schema.Types.ObjectId, ref: "order", required: true},
    vendorId: {type: mongoose.Schema.Types.ObjectId, ref: "vendor", required: true},
    paymentId: {type: mongoose.Schema.Types.ObjectId, ref: "payment", default: null},

    // ── financial breakdown — all server-computed ───────────────
    customerPaymentAmount: {type: Number, required: true, min: 0},
    goodsAmount: {type: Number, required: true, min: 0},
    deliveryAmount: {type: Number, required: true, min: 0},
    additionalChargesAmount: {type: Number, required: true, min: 0},
    companyAmount: {type: Number, required: true, min: 0},
    vendorAmount: {type: Number, required: true, min: 0},
    // cash-fee clawback applied to this settlement: the total of outstanding
    // cash-order handling fees deducted from vendorAmount at creation time
    cashFeesDeducted: {type: Number, default: 0, min: 0},
    currency: {type: String, default: "NPR", immutable: true},

    // ── status ─────────────────────────────────────────────────
    status: {type: String, enum: SETTLEMENT_STATUSES, default: "pending"},

    // ── payout destination — SNAPSHOT at creation time ─────────
    // if the vendor later changes payout info, existing
    // settlements remain unchanged
    payoutDestination: {type: payoutSnapshotSchema, default: () => ({})},

    // ── payout tracking ────────────────────────────────────────
    payoutMethod: {type: String, default: null, trim: true},
    payoutReference: {type: String, default: null, trim: true},
    paidByAdminId: {type: mongoose.Schema.Types.ObjectId, ref: "admin", default: null},
    paidAt: {type: Date, default: null},

    // ── admin notes ────────────────────────────────────────────
    adminNote: {type: String, default: null, trim: true}
}, {timestamps: true});

// one settlement per order (prevents duplicate payouts for the same order)
settlementSchema.index({orderId: 1}, {unique: true});

// fast lookup of settlements by vendor (for vendor earnings view / admin filtering)
settlementSchema.index({vendorId: 1, createdAt: -1});

// fast lookup of settlements by status (for admin pending payouts queue)
settlementSchema.index({status: 1, createdAt: 1});

// fast lookup by payment reference
settlementSchema.index({paymentId: 1}, {sparse: true});

const settlementModel = mongoose.models.settlement || mongoose.model("settlement", settlementSchema);

export default settlementModel;
export {SETTLEMENT_STATUSES};
