import { api, ApiError, getServerMessage } from '@/services/api';
import type { PlaceOrderRequest, PlaceOrderResponse } from '@/types';

/**
 * Place an order via POST /api/orders/place.
 *
 * Goes through the centralized axios client (auth header, timeout and
 * ApiError normalization are handled there). The caller owns the transaction
 * safety: this function is invoked exactly once per user tap and NEVER
 * auto-retried (the shared QueryClient already sets mutation retry to 0).
 *
 * - Transport failures (no response / timeout) reject with kind
 *   `network`/`timeout` and `isServerResponse:false` — the caller must treat
 *   those as "outcome unknown" and keep the cart.
 * - HTTP failures reject with an ApiError carrying the server message
 *   (e.g. "Cart is empty", "A valid delivery location is required",
 *   "One or more items no longer exist").
 */
export async function placeOrder(input: PlaceOrderRequest): Promise<PlaceOrderResponse['data']> {
  const { data } = await api.post<PlaceOrderResponse>('/api/orders/place', input);

  // Defensive: a 201 that somehow lacked a usable body must look like a real
  // server error, not silently succeed with nothing to confirm.
  if (!data || data.success !== true || !data.data) {
    throw new ApiError(getServerMessage(data, 'Failed to place order'), {
      payload: data,
      status: 500,
      kind: 'http',
    });
  }

  return data.data;
}