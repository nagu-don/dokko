import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getNewRequests,
  getVendorProfile,
  updateVendorLocation,
} from '@/services/vendors';
import type { LatLng, UpdateVendorLocationInput, VendorPresentedOrder, VendorProfile } from '@/types';

/**
 * Vendor server state (Phase 9). Tenant isolation mirrors the customer side:
 * every screen here reads these shared keys so one request is shared, and a
 * single mutation invalidates every dependent query.
 *
 * Polling: the vendor web app loads /api/vendors/requests/new ONCE on mount —
 * there is NO interval polling (verified in vendor/src/pages/NewRequests).
 * So this list is refreshed on mount/focus + pull-to-refresh only. The
 * backend also exposes no priorityExpiresAt in `presentOrder`, so the app
 * must never locally expire a request.
 */

/** Vendor profile — drive the readiness (onboarding vs dashboard) split. */
export const vendorProfileQueryKey = ['vendor', 'me'] as const;

/** Incoming (unclaimed) requests offered to THIS vendor by the server. */
export const vendorRequestsQueryKey = ['vendor', 'requests', 'new'] as const;

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
    refetchOnMount: 'always',
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