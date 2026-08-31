import { useQuery } from '@tanstack/react-query';
import { fetchApprovedItems } from '@/services/items';
import type { Item } from '@/types';

/**
 * Stable query key for the approved catalog. Exported so future screens
 * (item details, explore) share one cache entry and never duplicate requests.
 */
export const approvedItemsQueryKey = ['items', 'approved'] as const;

/**
 * Server state for the approved item catalog.
 *
 * Retry / stale-time / refetch rules come from the shared QueryClient
 * defaults (retry 1, staleTime 30s, no refetch-on-focus). The result stays
 * cached for the session — no cross-screen re-fetch, no store duplication.
 */
export function useApprovedItems() {
  return useQuery<Item[]>({
    queryKey: approvedItemsQueryKey,
    queryFn: fetchApprovedItems,
  });
}