import { api, ApiError, getServerMessage } from '@/services/api';
import type { ApiEnvelope, Role, UserProfile, VendorProfile } from '@/types';

/**
 * Profile reads used to validate / refresh an authenticated session.
 *
 * The backend returns DIFFERENT shapes per role:
 *  - GET /api/users/me            -> { success, data: raw mongoose user } (`_id`)
 *  - GET /api/vendors/me           -> { success, data: { id, name, email, phone, ... } }
 * These are wrapped in `data` (unlike the top-level auth envelope).
 */

export async function fetchProfile(
  role: Role,
  timeoutMs?: number
): Promise<UserProfile | VendorProfile | null> {
  const url = role === 'vendor' ? '/api/vendors/me' : '/api/users/me';
  const { data } = await api.get<ApiEnvelope<UserProfile | VendorProfile>>(url, timeoutMs ? { timeout: timeoutMs } : undefined);
  if (!data || data.success !== true || !data.data) return null;
  return data.data;
}

/** Shorter timeout for the boot-time session check so launch stays snappy. */
export const BOOT_VALIDATE_TIMEOUT_MS = 8000;

/**
 * Best-effort validation of a restored token. Returns true when the session
 * is still accepted by the backend, false when it was explicitly rejected.
 *
 * - A 401 (invalid/expired token) clears state and returns false.
 *   A 403 from /me is unlikely (auth middleware only returns 401) but is
 *   also treated as a session failure defensively.
 * - A network/timeout failure returns undefined: we do NOT log the user out
 *   just because they launched offline — offline launch should restore.
 */
export async function validateSession(role: Role): Promise<true | false | undefined> {
  try {
    const profile = await fetchProfile(role, BOOT_VALIDATE_TIMEOUT_MS);
    return profile ? true : false;
  } catch (error) {
    if (error instanceof Error && 'status' in error && (error as { status?: number }).status) {
      const status = (error as { status: number }).status;
      if (status === 401 || status === 403) return false;
    }
    return undefined;
  }
}

/**
 * Update the customer's phone (PATCH /api/users/phone, authUser).
 *
 * The backend normalizes to bare digits itself, then enforces `/^\d{10}$/`
 * (400 "Phone number must be exactly 10 digits") and unique-across-users
 * (400 "This phone number is already in use"). Returns the updated profile.
 */
export async function updatePhone(phone: string): Promise<UserProfile> {
  const { data } = await api.patch<ApiEnvelope<UserProfile>>('/api/users/phone', { phone });
  if (!data || data.success !== true || !data.data) {
    throw new ApiError(getServerMessage(data, 'Failed to update phone'), { payload: data });
  }
  return data.data;
}

/**
 * Pull a friendly message off a 200-with-success:false profile response.
 * Not used by validation (that returns null on failure), exposed for callers
 * that surface profile errors.
 */
export function profileServerMessage(payload: unknown, fallback = 'Could not load your profile'): string {
  return getServerMessage(payload, fallback);
}
