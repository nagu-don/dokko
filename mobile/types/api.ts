/**
 * API wire envelopes — matches the EXACT backend behavior documented in the
 * Phase 0 reference (mobileref.txt). The backend is inconsistent on purpose:
 * auth responses are top-level, most reads wrap objects in `data`.
 * Use the type that matches the endpoint you call.
 */
import type { AuthUserLite } from './auth';

/** Most reads: `{ success, message?, data: T }`. */
export interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

/** Auth responses (register/login/google): token + user at top level. */
export interface AuthEnvelope {
  success: boolean;
  message?: string;
  token?: string;
  user?: AuthUserLite;
}

/** Generic success/message envelope used by mutations (accept, location, …). */
export interface ApiMessage {
  success: boolean;
  message?: string;
}

/** Error shape the backend returns on auth-style failures (HTTP 200 + success:false). */
export interface ApiFailure {
  success: false;
  message?: string;
}

export interface ApiErrorPayload {
  status?: number;
  data?: unknown;
  message?: string;
}