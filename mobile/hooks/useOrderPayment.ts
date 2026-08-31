import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getOrderPayment, initiateOrderPayment } from '@/services/payments';
import { myOrdersQueryKey } from '@/hooks/useMyOrders';
import type { OrderPaymentState, PaymentDto } from '@/types';
import { isTerminalPaymentStatus } from '@/utils/paymentModel';

/**
 * Customer payment server state (Phase 8C).
 *
 * `useOrderPaymentState` polls GET /api/orders/:orderId/payment ONLY while the
 * order is payable AND the attempt is non-terminal (active or received). Once
 * the payment settles (or the order stops being payable) polling stops so the
 * device is not hammered in the background. It replaces the Phase-0 "customer
 * polls 5s" cadence with a TanStack-controlled interval.
 *
 * `useInitiateOrderPayment` is a no-retry mutation (the shared QueryClient
 * already sets `mutations.retry = 0`) — one tap → one request, matching the
 * order-placement transaction rule. On success it refreshes the payment state
 * AND the order list (order.paymentStatus moves to pending, then paid).
 */
export const orderPaymentQueryKey = (orderId: string) =>
  ['payments', 'order', orderId] as const;

/** Customer payment-poll cadence — mirrors the web's documented 5s. */
export const PAYMENT_POLL_INTERVAL_MS = 5000;

export function useOrderPaymentState(orderId: string) {
  return useQuery<OrderPaymentState>({
    queryKey: orderPaymentQueryKey(orderId),
    queryFn: () => getOrderPayment(orderId),
    staleTime: 10_000,
    refetchOnMount: 'always',
    enabled: orderId.length > 0,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return PAYMENT_POLL_INTERVAL_MS;
      if (!data.paymentRequired) return false;
      if (data.payment && isTerminalPaymentStatus(data.payment.status)) return false;
      return PAYMENT_POLL_INTERVAL_MS;
    },
  });
}

export function useInitiateOrderPayment(orderId: string) {
  const queryClient = useQueryClient();

  return useMutation<PaymentDto, unknown, string | undefined>({
    mutationFn: (provider) => initiateOrderPayment(orderId, provider),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderPaymentQueryKey(orderId) });
      queryClient.invalidateQueries({ queryKey: myOrdersQueryKey });
    },
  });
}