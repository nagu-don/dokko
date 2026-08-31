/**
 * Roles are whatever the backend actually validates. There are NO numeric/
 * enum role codes in the backend — access is granted by WHICH collection the
 * account lives in (user, vendor, admin) and enforced by separate middleware
 * (authUser / authVendor / authAdmin). The client therefore derives `role`
 * from the auth endpoint used to sign in.
 */
export type Role = 'customer' | 'vendor' | 'admin';

/** `user` object returned by /api/users|vendors/register|login|google. */
export interface AuthUserLite {
  id: string;
  name: string;
  email: string;
  phone: string;
}

/** Local auth state persisted to SecureStore (token separately). */
export interface StoredAuthUser {
  role: Role;
  user: AuthUserLite;
}

export type AuthStatus =
  | 'idle'
  | 'loading'
  | 'authenticated'
  | 'unauthenticated';

/**
 * Result of a login/register attempt so screens can show backend messages.
 * `kind` classifies the failure so UI layers can choose localized copy
 * (network vs timeout vs server) instead of showing a raw string.
 */
export interface AuthAttempt {
  ok: boolean;
  message?: string;
  kind?: 'network' | 'timeout' | 'http' | 'unknown';
  /** HTTP status when the server responded (auth returns 200 with success:false). */
  status?: number;
}