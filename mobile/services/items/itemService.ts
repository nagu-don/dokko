import { api } from '@/services/api';
import { ApiError, getServerMessage } from '@/services/api';
import type { ApprovedItemsResponse, Item } from '@/types';

/**
 * Retrieve the admin-approved item catalog.
 *
 * Goes through the centralized axios client (base URL, auth header, timeout
 * and ApiError normalization are all handled there). Screens never call
 * axios directly — they use this service via the `useApprovedItems` query.
 */
export async function fetchApprovedItems(): Promise<Item[]> {
  const { data } = await api.get<ApprovedItemsResponse>('/api/items/list-approved');

  if (!data?.success) {
    throw new ApiError(getServerMessage(data, 'Failed to fetch items'), { payload: data });
  }

  // Defensive slice: a malformed body must never crash the home screen.
  return Array.isArray(data.data) ? data.data : [];
}