import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchProfile, updatePhone } from '@/services/auth/profileService';
import type { UserProfile, VendorProfile } from '@/types';

/**
 * Customer profile server state used by checkout.
 *
 * GET /api/users/me returns a raw mongoose user doc; verifying the phone is
 * exactly what the backend PATCH contract expects (`_id` + phone present).
 * Shared cache key so the checkout and any future contact screens reuse one
 * request. The phone update write-through updates the same cache entry.
 */

export const myProfileQueryKey = ['user', 'me'] as const;

export function useMyProfile() {
  return useQuery<UserProfile | VendorProfile | null>({
    queryKey: myProfileQueryKey,
    queryFn: () => fetchProfile('customer'),
    staleTime: 30_000,
  });
}

/** Persist a phone change; on success the shared profile cache is refreshed. */
export function useUpdateMyPhone() {
  const queryClient = useQueryClient();
  return useMutation<UserProfile, unknown, string>({
    mutationFn: (phone) => updatePhone(phone),
    onSuccess: (updated) => {
      queryClient.setQueryData(myProfileQueryKey, updated);
    },
  });
}