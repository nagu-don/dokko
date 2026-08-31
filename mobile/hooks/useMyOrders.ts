import { useQuery } from '@tanstack/react-query';
import { getMyOrders } from '@/services/orders';
import type { OrderRead } from '@/types';
import { isOrderTerminal } from '@/utils/orderModel';

/**
 * Customer order server state — the SINGLE source of truth for every customer
 * order screen (history index + detail/tracking). Both screens read this one
 * query so the same order is never polled by unrelated components.
 *
 * Polling (TanStack Query `refetchInterval`, NOT setInterval):
 *  - Interval is the customer web cadence documented in mobileref.txt
 *    ("customer polls 5s") — ORDER_POLL_INTERVAL_MS = 5s.
 *  - The callback inspects the CURRENT data and only keeps polling while at
 *    least one order is non-terminal (searching / pending / processing /
 *    assigned-but-not-delivered). It stops when every order is terminal
 *    (Delivered / Cancelled / NO_VENDOR_AVAILABLE).
 *  - `refetchOnMount: 'always'` makes order screens show fresh state on entry.
 *
 * The backend exposes NO single-order GET endpoint for customers, so the
 * detail screen resolves a specific order from this same list cache rather
 * than issuing its own request (avoids duplicate polling entirely).
 */
export const myOrdersQueryKey = ['orders', 'mine'] as const;

/** Customer order-poll cadence — matches the web's documented 5s. */
export const ORDER_POLL_INTERVAL_MS = 5000;

export function useMyOrders() {
  return useQuery<OrderRead[]>({
    queryKey: myOrdersQueryKey,
    queryFn: getMyOrders,
    staleTime: 10_000,
    refetchOnMount: 'always',
    refetchInterval: (query) => {
      const orders = query.state.data;
      const hasActiveArray = Array.isArray(orders);
      const anyActive = hasActiveArray && orders.some((o) => !isOrderTerminal(o));
      return anyActive ? ORDER_POLL_INTERVAL_MS : false;
    },
  });
}

/** Resolve one order from the shared ['orders','mine'] cache (no own request). */
export function useMyOrder(orderId: string | undefined) {
  const query = useMyOrders();
  const order = (query.data ?? []).find((o) => o._id === orderId);
  return { ...query, data: order };
}
