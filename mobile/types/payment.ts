import type { ApiEnvelope } from './api';

/**
 * Customer payment wire types (Phase 8C) — matched EXACTLY against the new
 * backend contracts in back-end/controllers/paymentController.js:
 *
 *   GET  /api/orders/:orderId/payment  (authUser)  → getOrderPayment
 *   POST /api/orders/:orderId/payment  (authUser)  → initiateCustomerPayment
 *
 * Safety contract honoured by the app:
 *  - `amount` is SERVER-AUTHORITATIVE (computeAmount). The app displays it,
 *    it never sends an amount and never computes money.
 *  - `availableProviders` lists allowed provider keys; the app sends back the
 *    chosen key or relies on the server default — no secrets, no config.
 *  - `qrData` (when present) is an opaque server-rendered data-URI PNG. The
 *    app renders it verbatim; it is NOT a proof of payment — only
 *    payment_verified / order paymentStatus=paid counts.
 */

/** Gateway provider keys (paymentModel.js PAYMENT_PROVIDERS). */
export type PaymentProvider = 'mock' | 'cash' | 'fonepay';

/** Payment attempt statuses (paymentModel.js PAYMENT_STATUSES). */
export type PaymentStatus =
  | 'created'
  | 'qr_generated'
  | 'awaiting_payment'
  | 'payment_received'
  | 'payment_verified'
  | 'amount_mismatch'
  | 'payment_failed'
  | 'payment_expired'
  | 'cancelled'
  | 'cash_recorded';

/** Order-level payment status (orderModel.js). */
export type OrderPaymentStatus =
  | 'unpaid'
  | 'pending'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'completed';

/** Shape returned by formatPaymentResponse (server-authoritative). */
export interface PaymentDto {
  paymentId: string;
  provider: PaymentProvider;
  /** Server-computed amount this attempt expects. */
  amount: number;
  /** Merchant reference used for reconciliation with the gateway. */
  reference: string;
  status: PaymentStatus;
  /** ISO timestamp; the attempt is invalid past this instant. */
  expiresAt: string;
  flow?: 'qr' | 'mock';
  /** Opaque server-rendered QR image (data-URI PNG) when the provider uses QR. */
  qrData?: string;
}

/** data of GET /api/orders/:orderId/payment */
export interface OrderPaymentState {
  order: {
    status: string;
    paymentStatus: string;
    paymentMethod: string | null;
  };
  /** True when the order is payable and money is not yet recorded. */
  paymentRequired: boolean;
  /** True when the customer may start a NEW payment attempt right now. */
  canInitiate: boolean;
  /** Server-computed amount due (null when not payable). */
  amount: number | null;
  /** Provider keys the gateway currently allows (empty = gateway down). */
  availableProviders: string[];
  /** Active attempt, or most recent attempt otherwise (lazily expired). */
  payment: PaymentDto | null;
}

export type OrderPaymentResponse = ApiEnvelope<OrderPaymentState>;

/** data of POST /api/orders/:orderId/payment */
export type InitiatePaymentResponse = ApiEnvelope<PaymentDto>;

/**
 * UI classification of the payment screen derived from server state.
 *   success     – verified / settlement already recorded
 *   pending     – a payment attempt exists and is in flight
 *   needsAction – nothing started yet, the Pay button should be shown
 *   failed      – last attempt entered a failure terminal state (retryable)
 *   expired     – last attempt expired (retryable)
 *   notRequired – order is not payable at this moment
 */
export type PaymentViewState =
  | 'success'
  | 'pending'
  | 'needsAction'
  | 'failed'
  | 'expired'
  | 'notRequired';