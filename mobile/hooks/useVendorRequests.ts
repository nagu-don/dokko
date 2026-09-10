import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptRequest,
  completeRequest,
  getAcceptedRequests,
  getCompletedRequests,
  getItemsSummary,
  getNewRequests,
  getNotices,
  getVendorProfile,
  hideSummaryItems,
  updateVendorLocation,
  updateVendorPayout,
} from '@/services/vendors';
import type { LatLng, UpdateVendorLocationInput, UpdateVendorPayoutInput, VendorNotice, VendorPresentedOrder, VendorProfile, VendorSummaryItem } from '@/types';

/**
 * Vendor server state (Phases 9–10). Tenant isolation mirrors the customer
 * side: every screen here reads these shared keys so one request is shared,
 * and a single mutation invalidates every dependent query.
 *
 * Polling: NONE. The incoming feed is refreshed only when the vendor asks —
 * pull-to-refresh on the dashboard / the explicit Refresh button on the
 * request detail screen. It is never polled (no refetchInterval) and never
 * auto-refetched on mount, so the page cannot refresh behind the user's back.
 * Stage/window expiry stays server-authoritative: the backend exposes
 * `priorityExpiresAt` in `presentOrder`, and the app only renders a local
 * countdown from it — it never locally expires a request or refetches on its
 * own; it only refetches when prompted.
 *
 * Phase 10 adds:
 *  - accept mutation → PATCH /api/vendors/requests/accept/:id
 *  - accepted orders query → GET /api/vendors/requests/accepted
 * After successful acceptance the accepted-order screen reads from the
 * accepted orders cache (which includes the just-accepted order) and the
 * request list is invalidated so the order disappears from incoming.
 */

/** Vendor profile — drive the readiness (onboarding vs dashboard) split. */
export const vendorProfileQueryKey = ['vendor', 'me'] as const;

/** Incoming (unclaimed) requests offered to THIS vendor by the server. */
export const vendorRequestsQueryKey = ['vendor', 'requests', 'new'] as const;

/** Accepted orders — GET /api/vendors/requests/accepted. */
export const vendorAcceptedQueryKey = ['vendor', 'requests', 'accepted'] as const;

/** Completed orders — GET /api/vendors/requests/completed (Phase 13). */
export const vendorCompletedQueryKey = ['vendor', 'requests', 'completed'] as const;

export function useVendorProfile() {
  return useQuery<VendorProfile>({
    queryKey: vendorProfileQueryKey,
    queryFn: getVendorProfile,
    staleTime: 30_000,
    refetchOnMount: 'always',
    retry: 1,
  });
}

export function useVendorRequests() {
  return useQuery<VendorPresentedOrder[]>({
    queryKey: vendorRequestsQueryKey,
    queryFn: getNewRequests,
    staleTime: 10_000,
    refetchOnMount: false,
    retry: 1,
  });
}

/** Resolve one request from the shared list cache (no own request). */
export function useVendorRequest(orderId: string | undefined) {
  const query = useVendorRequests();
  const request = (query.data ?? []).find((r) => r.id === orderId);
  return { ...query, data: request };
}

/** Set the working location; refresh profile + the offered list afterwards. */
export function useUpdateVendorLocation() {
  const queryClient = useQueryClient();
  return useMutation<LatLng, unknown, UpdateVendorLocationInput>({
    mutationFn: updateVendorLocation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vendorProfileQueryKey });
      queryClient.invalidateQueries({ queryKey: vendorRequestsQueryKey });
    },
  });
}

/** Save vendor payout info; refreshes the profile cache. */
export function useUpdateVendorPayout() {
  const queryClient = useQueryClient();
  return useMutation<VendorProfile, unknown, UpdateVendorPayoutInput>({
    mutationFn: updateVendorPayout,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vendorProfileQueryKey });
    },
  });
}

/** GET /api/vendors/requests/accepted — orders currently assigned to this vendor. */
export function useVendorAcceptedOrders() {
  return useQuery<VendorPresentedOrder[]>({
    queryKey: vendorAcceptedQueryKey,
    queryFn: getAcceptedRequests,
    staleTime: 30_000,
    refetchOnMount: 'always',
    retry: 1,
  });
}

/**
 * PATCH /api/vendors/requests/accept/:id — claim an order.
 * On success: invalidates both the incoming and accepted lists so the order
 * disappears from incoming and appears in accepted. The mutation response
 * contains the authoritative presentOrder (priorityStage=ASSIGNED).
 *
 * retry=0: never auto-retry a state-changing mutation. A timeout means the
 * outcome is uncertain — the caller must resolve it by checking the list.
 */
export function useAcceptRequest() {
  const queryClient = useQueryClient();
  return useMutation<VendorPresentedOrder, unknown, string>({
    mutationFn: acceptRequest,
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vendorRequestsQueryKey });
      queryClient.invalidateQueries({ queryKey: vendorAcceptedQueryKey });
    },
  });
}

/** Resolve one accepted order from the shared accepted-list cache. */
export function useVendorAcceptedOrder(orderId: string | undefined) {
  const query = useVendorAcceptedOrders();
  const order = (query.data ?? []).find((r) => r.id === orderId);
  return { ...query, data: order };
}

/**
 * GET /api/vendors/requests/completed — this vendor's completed order history.
 *
 * The server defines "completed" (paymentStatus === "completed" for this
 * vendor). This is a read-only history source: it is refreshed on
 * mount/focus + pull-to-refresh and invalidated after a confirmed completion,
 * never polled/backgrounded (Phase 13 rules — no live tracking).
 */
export function useVendorCompletedOrders() {
  return useQuery<VendorPresentedOrder[]>({
    queryKey: vendorCompletedQueryKey,
    queryFn: getCompletedRequests,
    staleTime: 30_000,
    refetchOnMount: 'always',
    retry: 1,
  });
}

/** Resolve one completed order from the shared completed-list cache. */
export function useVendorCompletedOrder(orderId: string | undefined) {
  const query = useVendorCompletedOrders();
  const order = (query.data ?? []).find((r) => r.id === orderId);
  return { ...query, data: order };
}

/**
 * PATCH /api/vendors/requests/complete/:id — mark delivery as complete.
 * On success: invalidates the accepted, new, and completed lists so the order
 * disappears from active accepted orders and its refreshed state is ready when
 * the completed history is visited. The mutation response contains the
 * authoritative presentOrder (status=Delivered).
 *
 * retry=0: never auto-retry a state-changing mutation. A timeout means the
 * outcome is uncertain — the caller must resolve it by checking the list.
 */
export function useCompleteRequest() {
  const queryClient = useQueryClient();
  return useMutation<VendorPresentedOrder, unknown, string>({
    mutationFn: completeRequest,
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vendorAcceptedQueryKey });
      queryClient.invalidateQueries({ queryKey: vendorRequestsQueryKey });
      queryClient.invalidateQueries({ queryKey: vendorCompletedQueryKey });
    },
  });
}

// ---------------------------------------------------------------------------
// Items Needed
// ---------------------------------------------------------------------------

const vendorItemsQueryKey = ['vendor', 'items-summary'] as const;

/** GET /api/vendors/summary — aggregated items this vendor still needs to deliver. */
export function useItemsSummary() {
  return useQuery<{ items: VendorSummaryItem[]; grandTotal: number }>({
    queryKey: vendorItemsQueryKey,
    queryFn: getItemsSummary,
    staleTime: 15_000,
    refetchOnMount: 'always',
    retry: 1,
  });
}

/** POST /api/vendors/summary/hide-items — mark checked items as obtained. */
export function useHideItems() {
  const queryClient = useQueryClient();
  return useMutation<void, unknown, string[]>({
    mutationFn: hideSummaryItems,
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vendorItemsQueryKey });
    },
  });
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

const vendorNoticesQueryKey = ['vendor', 'notices'] as const;

/**
 * GET /api/vendors/notices — admin broadcast notices for all vendors.
 *
 * Read-only, nothing invalidates it locally (only admins post notices).
 * Refresh on mount/focus + pull-to-refresh; no polling.
 */
export function useVendorNotices() {
  return useQuery<VendorNotice[]>({
    queryKey: vendorNoticesQueryKey,
    queryFn: getNotices,
    staleTime: 30_000,
    refetchOnMount: 'always',
    retry: 1,
  });
}