import { api, ApiError, getServerMessage } from '@/services/api';
import type {
  ApiEnvelope,
  VendorCancelPaymentResponse,
  VendorCashPaymentResponse,
  VendorInitiatePaymentResponse,
  VendorPaymentStatusResponse,
  VendorVerifyPaymentResponse,
} from '@/types';

/**
 * Vendor payment API (Phase 11). Every endpoint is authVendor-guarded with
 * ownership checks (order.vendor === token vendor or payment.vendorId).
 *
 * The vendor payment flow is customer payment COLLECTION — the vendor
 * facilitates customer payment (QR) or records cash. The server computes
 * amounts and verifies provider responses; the mobile client never sends
 * an amount.
 *
 * Idempotency (verified backend):
 *  - initiatePayment: returns existing active payment if one already exists
 *  - recordCashPayment: 409 if verified/cash_recorded already exists
 *  - triggerVerification: 200 if already verified, 409 if terminal
 *  - cancelPayment: no-op if no active payment exists
 *  - revokeCashPayment: 409 if no cash_recorded payment exists
 */

const VENDOR_PAYMENTS_BASE = '/api/vendors/payments';

/**
 * POST /api/vendors/payments/initiate/:orderId — start (or reuse) a digital
 * payment. The server creates a payment record, calls the provider, and
 * returns the full payment data including QR if applicable.
 *
 * On duplicate active: returns the existing payment (idempotent, 200).
 * On gateway down: 503 "Payment gateway is not configured".
 * On order not payable: 409 with specific message.
 *
 * The response is `formatPaymentResponse(payment, providerResult)` — see
 * back-end/controllers/paymentController.js for the exact shape.
 */
export async function initiateVendorPayment(
  orderId: string,
  provider?: string
): Promise<VendorInitiatePaymentResponse> {
  const body = provider ? { provider } : {};
  const { data } = await api.post<
    ApiEnvelope<VendorInitiatePaymentResponse | undefined> | undefined
  >(`${VENDOR_PAYMENTS_BASE}/initiate/${encodeURIComponent(orderId)}`, body);

  if (!data || data.success !== true || !data.data) {
    throw new ApiError(getServerMessage(data, 'Failed to initiate payment'), {
      payload: data,
      status: data?.success === false ? 409 : 500,
      kind: 'http',
    });
  }

  return data.data;
}

/**
 * POST /api/vendors/payments/cash/:orderId — record a cash payment.
 *
 * Guards: order must be Processing, deliveryCharge set, no existing verified
 * or cash_recorded payment. Cancels any active digital payment first.
 *
 * The amount and cashHandlingFee are computed server-side from the order.
 */
export async function recordVendorCashPayment(
  orderId: string
): Promise<VendorCashPaymentResponse> {
  const { data } = await api.post<
    ApiEnvelope<VendorCashPaymentResponse | undefined> | undefined
  >(`${VENDOR_PAYMENTS_BASE}/cash/${encodeURIComponent(orderId)}`);

  if (!data || data.success !== true || !data.data) {
    throw new ApiError(getServerMessage(data, 'Failed to record cash payment'), {
      payload: data,
      status: data?.success === false ? 409 : 500,
      kind: 'http',
    });
  }

  return data.data;
}

/**
 * POST /api/vendors/payments/verify/:paymentId — trigger server-side
 * verification of a digital payment. The server checks with the provider
 * and marks payment_verified if confirmed.
 *
 * Guards: must have a providerTransactionId, must not be already terminal.
 * Already verified → 200 with success message (idempotent).
 */
export async function verifyVendorPayment(
  paymentId: string
): Promise<VendorVerifyPaymentResponse> {
  const { data } = await api.post<
    ApiEnvelope<VendorVerifyPaymentResponse | undefined> | undefined
  >(`${VENDOR_PAYMENTS_BASE}/verify/${encodeURIComponent(paymentId)}`);

  if (!data || data.success !== true || !data.data) {
    throw new ApiError(getServerMessage(data, 'Failed to verify payment'), {
      payload: data,
      status: data?.success === false ? 409 : 500,
      kind: 'http',
    });
  }

  return data.data;
}

/**
 * POST /api/vendors/payments/cancel/:orderId — cancel an active digital
 * payment. Resets order.paymentStatus to unpaid and paymentMethod to null.
 */
export async function cancelVendorPayment(
  orderId: string
): Promise<VendorCancelPaymentResponse> {
  const { data } = await api.post<
    ApiEnvelope<VendorCancelPaymentResponse | undefined> | undefined
  >(`${VENDOR_PAYMENTS_BASE}/cancel/${encodeURIComponent(orderId)}`);

  if (!data || data.success !== true || !data.data) {
    throw new ApiError(getServerMessage(data, 'Failed to cancel payment'), {
      payload: data,
      status: data?.success === false ? 409 : 500,
      kind: 'http',
    });
  }

  return data.data;
}

/**
 * POST /api/vendors/payments/revoke-cash/:orderId — revoke a cash_recorded
 * payment. Resets order.paymentStatus to unpaid.
 */
export async function revokeVendorCashPayment(
  orderId: string
): Promise<VendorCancelPaymentResponse> {
  const { data } = await api.post<
    ApiEnvelope<VendorCancelPaymentResponse | undefined> | undefined
  >(`${VENDOR_PAYMENTS_BASE}/revoke-cash/${encodeURIComponent(orderId)}`);

  if (!data || data.success !== true || !data.data) {
    throw new ApiError(getServerMessage(data, 'Failed to revoke cash payment'), {
      payload: data,
      status: data?.success === false ? 409 : 500,
      kind: 'http',
    });
  }

  return data.data;
}

/**
 * GET /api/vendors/payments/status/:paymentId — poll the server-stored
 * payment status. Also triggers lazy expiry of active payments.
 *
 * Used for polling while a digital payment is in flight. Returns the
 * server-authoritative status (not derived from local state).
 */
export async function getVendorPaymentStatus(
  paymentId: string
): Promise<VendorPaymentStatusResponse> {
  const { data } = await api.get<
    ApiEnvelope<VendorPaymentStatusResponse | undefined> | undefined
  >(`${VENDOR_PAYMENTS_BASE}/status/${encodeURIComponent(paymentId)}`);

  if (!data || data.success !== true || !data.data) {
    throw new ApiError(getServerMessage(data, 'Failed to load payment status'), {
      payload: data,
      status: data?.success === false ? 404 : 500,
      kind: 'http',
    });
  }

  return data.data;
}

/**
 * POST /api/vendors/payments/mock/:paymentId/complete — dev-only mock
 * completion. Requires provider "mock" and vendor ownership. Used for
 * testing when the mock provider is active.
 *
 * NOT for production — only use in development with PAYMENT_PROVIDER=mock.
 */
export async function completeMockVendorPayment(
  paymentId: string
): Promise<VendorVerifyPaymentResponse> {
  const { data } = await api.post<
    ApiEnvelope<VendorVerifyPaymentResponse | undefined> | undefined
  >(`${VENDOR_PAYMENTS_BASE}/mock/${encodeURIComponent(paymentId)}/complete`);

  if (!data || data.success !== true || !data.data) {
    throw new ApiError(getServerMessage(data, 'Failed to complete mock payment'), {
      payload: data,
      status: data?.success === false ? 400 : 500,
      kind: 'http',
    });
  }

  return data.data;
}
