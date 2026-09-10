/**
 * In-memory token holder shared between the axios client (request
 * interceptor) and the auth store/service. It lives in its own module to
 * avoid a circular import (client <-> authStore).
 *
 * The token is ALSO persisted in SecureStore; this reflects the value while
 * the app is running. Keeping both in sync is the auth store's job.
 *
 * It also hosts an `onUnauthorized` hook so the axios response interceptor can
 * tell the auth store when the backend rejected a token (401), letting the
 * store clear the stale session instead of leaving auth state inconsistent.
 * 403 (authenticated but forbidden) does NOT trigger this hook — callers
 * handle it as a normal business-rule error.
 */
let token: string | null = null;

type UnauthorizedHandler = () => void;
const unauthorizedHandlers = new Set<UnauthorizedHandler>();

export function setAuthToken(next: string | null): void {
  token = next;
}

export function getAuthToken(): string | null {
  return token;
}

export function clearAuthToken(): void {
  token = null;
}

/** Register a callback fired when a protected request returns 401. */
export function onUnauthorized(handler: UnauthorizedHandler): () => void {
  unauthorizedHandlers.add(handler);
  return () => unauthorizedHandlers.delete(handler);
}

/** Invoke all unauthorized handlers (settles async but not awaited here). */
export function notifyUnauthorized(): void {
  unauthorizedHandlers.forEach((handler) => {
    try {
      handler();
    } catch {
      // handlers must not break the response pipeline
    }
  });
}
