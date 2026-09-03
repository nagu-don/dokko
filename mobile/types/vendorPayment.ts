import type { PaymentDto, PaymentProvider, PaymentStatus } from './payment';

/**
 * Vendor payment types — matched against the backend vendor payment endpoints
 * (back-end/controllers/paymentController.js via vendorRouter.js):
 *
 *   POST /api/vendors/payments/initiate/:orderId  → createDigitalPayment
 *   POST /api/vendors/payments/cash/:orderId      → recordCashPayment
 *   POST /api/vendors/payments/verify/:paymentId  → triggerVerification
 *   POST /api/vendors/payments/cancel/:orderId    → cancelPayment
 *   POST /api/vendors/payments/revoke-cash/:orderId → revokeCashPayment
 *   GET  /api/vendors/payments/status/:paymentId  → getPaymentStatus
 *
 * The vendor payment flow is CUSTOMER PAYMENT COLLECTION:
 *  - The vendor initiates a digital payment (generates QR for customer)
 *  - The vendor records cash if customer pays in cash
 *  - The vendor can verify a digital payment after provider processing
 *  - The vendor can cancel/revoke payments
 *
 * Safety:
 *  - Amount is SERVER-AUTHORITATIVE (computeAmount from order)
 *  - Vendor ownership is checked (order.vendor === req.account._id)
 *  - Operations are idempotent (initiate returns existing active payment)
 *  - Provider secrets stay server-side only
 */

/** Response from GET /api/vendors/payments/status/:paymentId */
export interface VendorPaymentStatusResponse {
  paymentId: string;
  provider: PaymentProvider;
  amount: number;
  status: PaymentStatus;
  expiresAt: string | null;
  paidAt: string | null;
  verifiedAt: string | null;
}

/** Response from POST /api/vendors/payments/initiate/:orderId (formatPaymentResponse) */
export type VendorInitiatePaymentResponse = PaymentDto;

/** Response from POST /api/vendors/payments/cash/:orderId */
export interface VendorCashPaymentResponse {
  paymentId: string;
  provider: 'cash';
  amount: number;
  reference: string;
  status: PaymentStatus;
  cashHandlingFee: number;
}

/** Response from POST /api/vendors/payments/verify/:paymentId */
export interface VendorVerifyPaymentResponse {
  paymentId: string;
  status: PaymentStatus;
}

/** Response from POST /api/vendors/payments/cancel/:orderId */
export interface VendorCancelPaymentResponse {
  paymentId: string;
  status: PaymentStatus;
}

/**
 * Vendor-side view of a digital payment attempt (combines initiate/status data
 * for the payment screen). `paymentId` is only available AFTER a payment has
 * been initiated or found active by the server.
 */
export interface VendorPaymentAttempt {
  paymentId: string;
  provider: PaymentProvider;
  amount: number;
  status: PaymentStatus;
  expiresAt: string | null;
  paidAt: string | null;
  verifiedAt: string | null;
  /** Server-rendered QR data-URI (only after initiate with QR flow). */
  qrData?: string;
  /** Merchant reference for reconciliation. */
  reference?: string;
}

/**
 * UI classification of the vendor payment screen derived from server state.
 *
 *   collectAction  – no payment started yet; show "Collect Payment" / "Record Cash"
 *   digitalPending – a digital payment is in flight; show QR + status
 *   cashPending    – cash was recorded but may need revocation
 *   needsVerify    – payment_received; vendor should trigger verification
 *   success        – terminal: payment_verified or cash_recorded
 *   failed         – terminal: payment_failed / cancelled / amount_mismatch
 *   expired        – terminal: payment_expired
 *   notReady       – order is not payable (Processing but deliveryCharge null)
 */
export type VendorPaymentViewState =
  | 'collectAction'
  | 'digitalPending'
  | 'cashPending'
  | 'needsVerify'
  | 'success'
  | 'failed'
  | 'expired'
  | 'notReady';
