import mongoose from 'mongoose'
import { PRIORITY_DELIVERY_CHARGES, PRIORITY_CONFIG } from "../config/priorityConfig.js";

// ── legacy constants (kept for backward-compat refs) ─────────
export const DELIVERY_CHARGE = PRIORITY_CONFIG.NEAR_CHARGE;
export const ADDITIONAL_CHARGES = 15;

const ORDER_STATUSES = ["Pending", "Processing", "Delivered", "Cancelled"];
const PAYMENT_STATUSES = ["unpaid", "pending", "paid", "failed", "refunded", "completed"];
const PAYMENT_METHODS = ["nepalpay", "mock", "cash", "cod"];

// progressive search stages — order starts at SEARCHING_0_5KM and
// advances through stages until a vendor accepts or it reaches SEARCHING_CLOSEST
const PRIORITY_STAGES = ["SEARCHING_0_5KM", "SEARCHING_1KM", "SEARCHING_CLOSEST", "NO_VENDOR_AVAILABLE", "ASSIGNED"];

// Kathmandu, Nepal — used as the fallback centre everywhere
export const KATHMANDU_COORDS = [85.324, 27.7172];

// GeoJSON Point storing the delivery drop-off chosen on the map
const dropoffSchema = new mongoose.Schema({
    type: {type: String, enum: ["Point"], default: "Point"},
    coordinates: {type: [Number], required: true}, // [lng, lat]
    label: {type: String, default: "", trim: true}  // optional human-readable name
}, {_id: false});

const orderItemSchema = new mongoose.Schema({
    item: {type: mongoose.Schema.Types.ObjectId, ref: "item"},
    nameEng: {type: String, required: true},
    // Nepali name snapshot so vendors can show item names in Nepali
    nameNep: {type: String, default: ""},
    quantity: {type: Number, required: true, min: 0.1},
    // max price per kg at the time of ordering
    priceAtOrder: {type: Number, required: true}
}, {_id: false});

const orderSchema = new mongoose.Schema({
    user: {type: mongoose.Schema.Types.ObjectId, ref: "user", required: true},
    items: {
        type: [orderItemSchema],
        validate: v => Array.isArray(v) && v.length > 0
    },
    totalQuantity: {type: Number, required: true, min: 0.1},
    subtotal: {type: Number, required: true, min: 0},

    // ── delivery charge ──────────────────────────────────────
    // null while the priority search is in progress; set to a
    // concrete value (50 / 75 / 120) only after a vendor accepts
    deliveryCharge: {type: Number, default: null, min: 0},

    additionalCharges: {type: Number, required: true, default: ADDITIONAL_CHARGES},
    total: {type: Number, required: true, min: 0},
    status: {type: String, enum: ORDER_STATUSES, default: "Pending"},

    // ── priority search ──────────────────────────────────────
    // tracks the progressive geo-search for a vendor
    priorityStage: {
        type: String,
        enum: PRIORITY_STAGES,
        default: "SEARCHING_0_5KM"
    },
    priorityStartedAt: {type: Date, default: null},
    priorityExpiresAt: {type: Date, default: null},

    // where the delivery should arrive — picked on the map at checkout
    dropoff: {type: dropoffSchema, default: null},

    // vendor fulfilment — set when a vendor accepts the request
    vendor: {type: mongoose.Schema.Types.ObjectId, ref: "vendor", default: null},
    acceptedAt: {type: Date, default: null},
    completedAt: {type: Date, default: null},

    // ── payment fields ────────────────────────────────────────
    // paymentStatus tracks the financial state of this order:
    //   unpaid     — no digital payment initiated (default for all orders)
    //   pending    — payment initiated, awaiting gateway confirmation
    //   paid       — gateway confirmed payment received
    //   failed     — payment attempt failed or expired
    //   refunded   — payment was refunded to customer
    paymentStatus: {type: String, enum: PAYMENT_STATUSES, default: "unpaid"},
    // null = no digital payment method (legacy / cash on delivery)
    paymentMethod: {type: String, enum: [...PAYMENT_METHODS, null], default: null}
}, {timestamps: true});

const orderModel = mongoose.models.order || mongoose.model("order", orderSchema);

export default orderModel;
export {ORDER_STATUSES, PAYMENT_STATUSES, PAYMENT_METHODS, PRIORITY_STAGES, PRIORITY_DELIVERY_CHARGES};
