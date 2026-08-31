import { SECURE_AUTH_TOKEN_KEY, SECURE_AUTH_USER_KEY } from '@/constants';
import { secureStorage } from '@/storage/secureStorage';
import type { AuthUserLite, Role, StoredAuthUser } from '@/types';

/**
 * Persistence for the auth session. Tokens and the minimal auth profile live
 * in expo-secure-store (keychain/keystore) — intentionally NOT AsyncStorage.
 */
export interface RestoredAuth {
  role: Role;
  user: AuthUserLite;
  token: string;
}

/** Persist a fresh session (token always stored; user struct stores role too). */
export async function persistAuth(role: Role, token: string, user: AuthUserLite): Promise<void> {
  await Promise.all([
    secureStorage.setItem(SECURE_AUTH_TOKEN_KEY, token),
    secureStorage.setJSON(SECURE_AUTH_USER_KEY, { role, user } satisfies StoredAuthUser),
  ]);
}

/**
 * Restore whatever session survives an app restart. Returns null when
 * nothing is stored or data is corrupt. The token is required; a user struct
 * keeps a placeholder when only a token exists (e.g. race on old installs).
 */
export async function restoreAuth(): Promise<RestoredAuth | null> {
  const token = await secureStorage.getItem(SECURE_AUTH_TOKEN_KEY);
  if (!token) return null;

  const stored = await secureStorage.getJSON<StoredAuthUser>(SECURE_AUTH_USER_KEY);
  if (stored && stored.user && stored.role) {
    return { token, role: stored.role, user: stored.user };
  }

  return { token, role: 'customer', user: { id: '', name: '', email: '', phone: '' } };
}

/** Wipe the session from secure storage. Does NOT touch AsyncStorage data. */
export async function clearAuth(): Promise<void> {
  await Promise.all([
    secureStorage.removeItem(SECURE_AUTH_TOKEN_KEY),
    secureStorage.removeItem(SECURE_AUTH_USER_KEY),
  ]);
}