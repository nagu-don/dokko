import { api } from '@/services/api';
import { getServerMessage } from '@/services/api';
import type { AuthEnvelope, Role } from '@/types';

/**
 * Auth network layer. Endpoints mirror the backend EXACTLY (see mobileref.txt
 * section 3). The store calls these, persists the session and updates memory.
 *
 * IMPORTANT: the backend returns HTTP 200 with `success:false` for
 * already-exists / invalid-credential errors, so callers MUST check
 * `envelope.success` and surface `envelope.message`, not the HTTP status.
 */

export interface LoginCredentials {
  /** email OR 10-digit phone — the backend accepts either. */
  identifier: string;
  password: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  phone: string; // must be exactly 10 digits
  password: string; // must be >= 6 chars
}

export interface GoogleInput {
  /** ID token produced by a native Google Sign-In SDK. */
  credential: string;
}

export interface LoginResult {
  role: Role;
  response: AuthEnvelope;
}

function assertSuccessful(envelope: AuthEnvelope): void {
  if (!envelope.success) {
    const error = new Error(getServerMessage(envelope, 'Authentication failed')) as Error & {
      payload?: AuthEnvelope;
    };
    error.payload = envelope;
    throw error;
  }
}

function authUrl(role: Role, action: 'register' | 'login' | 'google'): string {
  if (role === 'vendor') {
    return `/api/vendors/${action}`;
  }
  return `/api/users/${action}`;
}

export async function login(role: Role, credentials: LoginCredentials): Promise<LoginResult> {
  const { data } = await api.post<AuthEnvelope>(authUrl(role, 'login'), credentials);
  assertSuccessful(data);
  return { role, response: data };
}

export async function register(role: Role, input: RegisterInput): Promise<LoginResult> {
  if (!PHONE_RE.test(input.phone)) {
    throw new Error('Phone number must be exactly 10 digits');
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error('Password must be at least 6 characters');
  }
  const { data } = await api.post<AuthEnvelope>(authUrl(role, 'register'), input);
  assertSuccessful(data);
  return { role, response: data };
}

/** Google Sign-In: backend verifies the ID token via JWKS/audience. */
export async function loginWithGoogle(role: Role, input: GoogleInput): Promise<LoginResult> {
  const { data } = await api.post<AuthEnvelope>(authUrl(role, 'google'), input);
  assertSuccessful(data);
  return { role, response: data };
}

// ---- contract validation (mirrors backend rules from Phase 0) ----
export const PHONE_RE = /^\d{10}$/;
export const MIN_PASSWORD_LENGTH = 6;