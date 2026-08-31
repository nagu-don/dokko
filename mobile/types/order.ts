import type { ApiEnvelope } from './api';
import type { Dropoff } from './location';

/**
 * Order placement wire types — matched EXACTLY against the verified backend
 * contract (back-end/controllers/orderController.js `placeOrder`):
 *
 *   POST /api/orders/place            (authUser)
 *   body: { items: [{ itemId, quantity }], dropoff: { lat, lng, label? } }
 *
 * - `itemId` is the backend item `_id` (the canonical identity also used by
 *   the cart), quantity is the cart's 1-dp kg value.
 * - `dropoff` is additive — the backend only reads `lat`/`lng` (and treats a
 *   GeoJSON `coordinates:[lng,lat]` array as an accepted alternative).
 * - The client NEVER sends price/name/image/subtotal: the backend
 *   re-validates existence and re-snapshots `priceAtOrder = maxPrice`.
 */

/** One cart line sent to the order API. */
export interface PlaceOrderItem {
  /** Backend item `_id` (string form). */
  itemId: string;
  /** Quantity in kg, matching cart precision (1 dp, > 0). */
  quantity: number;
}

export interface PlaceOrderRequest {
  items: PlaceOrderItem[];
  dropoff: Dropoff;
}

export type PlaceOrderResponse = ApiEnvelope<CreatedOrder>;

/**
 * The slice of the raw mongoose order doc the mobile UI actually consumes.
 * The backend returns the full document; extra fields are intentionally not
 * typed here. Server-controlled values (totals, payment fields, vendor,
 * priority stage) are for display only — NEVER sent back to the API.
 */
export interface CreatedOrder {
  _id: string;
  status?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  totalQuantity?: number;
  subtotal?: number;
  additionalCharges?: number;
  deliveryCharge?: number | null;
  total?: number;
  priorityStage?: string;
  createdAt?: string;
}

/**
 * ── Order reading / tracking (GET /api/orders/my) ──────────────
 * The mobile customer order-read model. Built EXACTLY on the backend
 * contract verified in back-end/controllers/orderController.js (`myOrders`)
 * + back-end/models/orderModel.js. The endpoint returns raw mongoose docs
 * with only `vendor` populated (name/phone); `dropoff` is GeoJSON
 * `coordinates:[lng, lat]`.
 */

/** Backend order.status enum (orderModel.js ORDER_STATUSES). */
export type OrderStatus = 'Pending' | 'Processing' | 'Delivered' | 'Cancelled';

/** Backend priorityStage enum (orderModel.js PRIORITY_STAGES). */
export type PriorityStage =
  | 'SEARCHING_0_5KM'
  | 'SEARCHING_1KM'
  | 'SEARCHING_CLOSEST'
  | 'NO_VENDOR_AVAILABLE'
  | 'ASSIGNED';

/** One snapshot item inside an order doc — history must stay fixed. */
export interface OrderReadItem {
  item?: string;
  nameEng: string;
  nameNep?: string;
  quantity: number;
  priceAtOrder: number;
}

/** GeoJSON drop-off as persisted on the order (NOT the live user location). */
export interface OrderReadDropoff {
  type?: string;
  coordinates: [number, number]; // [lng, lat]
  label?: string;
  /** Resolved convenience coordinates, derived client-side from `coordinates`. */
  lat?: number;
  lng?: number;
}

/** Populated vendor reference when an order is ASSIGNED. */
export interface OrderVendorRef {
  _id: string;
  name?: string;
  phone?: string;
}

/** Customer order as returned by GET /api/orders/my (raw mongoose doc). */
export interface OrderRead {
  _id: string;
  items: OrderReadItem[];
  totalQuantity: number;
  subtotal: number;
  deliveryCharge: number | null;
  additionalCharges: number;
  total: number;
  status: string;
  priorityStage: string;
  priorityStartedAt?: string | null;
  priorityExpiresAt?: string | null;
  dropoff: OrderReadDropoff | null;
  vendor: OrderVendorRef | null;
  acceptedAt?: string | null;
  completedAt?: string | null;
  paymentStatus?: string;
  paymentMethod?: string | null;
  createdAt: string;
  updatedAt?: string;
}

/** GET /api/orders/my envelope: `{ success, data: OrderRead[] }`. */
export type OrderListResponse = ApiEnvelope<OrderRead[]>;

/** UI classification of an order for the active/history split. */
export type OrderBucket = 'active' | 'completed' | 'failed' | 'cancelled';