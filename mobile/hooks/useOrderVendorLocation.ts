import { useQuery } from '@tanstack/react-query';
import { getOrderVendorLocation } from '@/services/orders';
import { ORDER_POLL_INTERVAL_MS } from '@/hooks/useMyOrders';
import type { OrderRead, OrderVendorLocationResponse } from '@/types';

/**
 * Customer live-track poll — GET /api/orders/:orderId/vendor-location.
 *
 * A SEPARATE query from ['orders','mine'] (which owns the order/status poll)
 * because live location changes far more often and is only relevant while a
 * vendor is actively delivering. Key: ['orders', {id}, 'vendor-location'].
 *
 * Lifecycle (server-authoritative):
 *  - Enabled ONLY while the order is Processing AND a vendor is assigned —
 *    i.e. tracking is actually possible. Before acceptance, and after the
 *    terminal states (Delivered/Cancelled/NO_VENDOR_AVAILABLE), it stops.
 *  - refetchInterval keeps polling while the LAST response says `tracking`
 *    is true; the moment the read returns tracking=false (order finished) the
 *    query stops polling, so we never hammer an endpoint that can no longer
 *    change.
 *
 * The response includes a server `location.lastUpdatedAt`, so the UI can show
 * freshness and must never present stale coords as live.
 */
export function useOrderVendorLocation(order: OrderRead | undefined) {
  const orderId = order?._id;
  const trackingPossible =
    !!orderId && order?.status === 'Processing' && Boolean(order?.vendor);

  return useQuery<OrderVendorLocationResponse>({
    queryKey: ['orders', orderId, 'vendor-location'],
    queryFn: () => getOrderVendorLocation(orderId as string),
    enabled: trackingPossible,
    staleTime: ORDER_POLL_INTERVAL_MS,
    refetchOnMount: true,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Keep polling only while tracking is active; stop as soon as it ends.
      return data?.tracking === true ? ORDER_POLL_INTERVAL_MS : false;
    },
    retry: 1,
  });
}
