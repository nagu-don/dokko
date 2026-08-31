import { api, ApiError, getServerMessage } from '@/services/api';
import type {
  InitiatePaymentResponse,
  OrderPaymentResponse,
  OrderPaymentState,
  PaymentDto,
} from '@/types';

/**
 * Customer payment API (Phase 8C). Both endpoints are order-owner-guarded on
 * the backend (order.user === token) and the amount is always server-derived.
 *
 * The app NEVER computes or sends money amounts; it only reads the
 * server-computed `amount` / `payment.amount` and echoes the selected provider.
 */

/** GET /api/orders/:orderId/payment — full payment state for the screen. */
export async function getOrderPayment(orderId: string): Promise<OrderPaymentState> {
  const { data } = await api.get<OrderPaymentResponse>(`/api/orders/${orderId}/payment`);

  if (!data || data.success !== true || !data.data) {
    throw new ApiError(getServerMessage(data, 'Failed to load payment state'), {
      payload: data,
      status: 500,
      kind: 'http',
    });
  }

  return data.data;
}

/**
 * POST /api/orders/:orderId/payment — start (or reuse) a payment attempt.
 * `provider` is optional; the backend defaults to its active provider when
 * omitted. Responses reuse an already-active attempt rather than duplicating.
 */
export async function initiateOrderPayment(
  orderId: string,
  provider?: string
): Promise<PaymentDto> {
  const body = provider ? { provider } : {};
  const { data } = await api.post<InitiatePaymentResponse>(
    `/api/orders/${orderId}/payment`,
    body
  );

  if (!data || data.success !== true || !data.data) {
    throw new ApiError(getServerMessage(data, 'Failed to initiate payment'), {
      payload: data,
      status: 500,
      kind: 'http',
    });
  }

  return data.data;
}