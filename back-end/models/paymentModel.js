import mongoose from 'mongoose'

const PAYMENT_PROVIDERS = ["mock", "cash", "fonepay"];
const PAYMENT_STATUSES = [
  "created",
  "qr_generated",
  "awaiting_payment",
  "payment_received",
  "payment_verified",
  "amount_mismatch",
  "payment_failed",
  "payment_expired",
  "cancelled",
  "cash_recorded"
];

const paymentSchema = new mongoose.Schema({
    // ── links ──────────────────────────────────────────────────
    orderId: {type: mongoose.Schema.Types.ObjectId, ref: "order", required: true},
    customerId: {type: mongoose.Schema.Types.ObjectId, ref: "user", required: true},
    vendorId: {type: mongoose.Schema.Types.ObjectId, ref: "vendor", default: null},

    // ── provider identification ────────────────────────────────
    provider: {type: String, enum: PAYMENT_PROVIDERS, required: true},
    // gateway transaction ID — set after callback
    // no default: omitted from documents until set, so sparse index allows
    // multiple documents without the field while enforcing uniqueness when present
    providerTransactionId: {type: String, default: undefined, trim: true},
    // our unique reference per request
    merchantReference: {type: String, required: true, trim: true},
    // opaque provider-generated QR string (stored verbatim; never reconstructed)
    qrString: {type: String, default: null},

    // ── amounts — server-determined, never trusted from client ──
    amountExpected: {type: Number, required: true, min: 0},
    amountReceived: {type: Number, default: null, min: 0},
    currency: {type: String, default: "NPR", immutable: true},

    // ── status ─────────────────────────────────────────────────
    status: {type: String, enum: PAYMENT_STATUSES, default: "created"},
    // ── duplicate-active protection ─────────────────────────────
    // Holds "active" ONLY while this attempt is in the active set
    // (created / qr_generated / awaiting_payment). Set to null the
    // moment the attempt leaves the active set. Paired with the
    // partial unique index on (orderId, activeAttempt) so at most
    // ONE active payment can exist per order — even when two
    // identical initiate requests arrive at nearly the same time.
    activeAttempt: {type: String, default: null},

    // ── provider-specific metadata ─────────────────────────────
    // QR reference for provider
    qrReference: {type: String, default: null},
    // raw payload from gateway callback — useful for disputes / audits
    providerPayload: {type: mongoose.Schema.Types.Mixed, default: null},

    // ── timestamps ─────────────────────────────────────────────
    expiresAt: {type: Date, default: null},
    paidAt: {type: Date, default: null},
    verifiedAt: {type: Date, default: null},

    // ── failure ────────────────────────────────────────────────
    failureReason: {type: String, default: null},

    // ── cash payment tracking ───────────────────────────────────
    // For cash payments: the handling fee to deduct from vendor's next settlement
    cashHandlingFee: {type: Number, default: 0, min: 0},
    // Whether the cash handling fee has been deducted from a settlement
    cashFeeDeducted: {type: Boolean, default: false}
}, {timestamps: true});

// ── unique constraints ───────────────────────────────────────
// one successful payment per order per provider (sparse so multiple
// "created" records are fine, but only one can reach "payment_verified")
paymentSchema.index(
    {orderId: 1, provider: 1, status: 1},
    {unique: true, partialFilterExpression: {status: "payment_verified"}}
);

// at most ONE active payment per order — even under concurrent initiate
paymentSchema.index(
    {orderId: 1, activeAttempt: 1},
    {unique: true, partialFilterExpression: {activeAttempt: "active"}}
);

// prevent duplicate gateway transaction IDs
// sparse index: only includes documents where the field exists and is non-null,
// so multiple null values are allowed but duplicate real values are rejected
paymentSchema.index(
    {providerTransactionId: 1},
    {unique: true, sparse: true}
);

// prevent duplicate merchant references
paymentSchema.index(
    {merchantReference: 1},
    {unique: true}
);

// fast lookup of payments belonging to an order
paymentSchema.index({orderId: 1, createdAt: -1});

// fast lookup of payments belonging to a customer
paymentSchema.index({customerId: 1, createdAt: -1});

// auto-expire stale pending payments (TTL index — MongoDB deletes the document
// after expiresAt is reached; only effective when status is still pending)
paymentSchema.index(
    {expiresAt: 1},
    {expireAfterSeconds: 0, partialFilterExpression: {status: {$in: ["created", "qr_generated", "awaiting_payment"]}}}
);

const paymentModel = mongoose.models.payment || mongoose.model("payment", paymentSchema);

export default paymentModel;
export {PAYMENT_PROVIDERS, PAYMENT_STATUSES};
