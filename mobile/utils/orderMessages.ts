import { isApiError, type ApiError } from '@/services/api';
import { t, tMsg } from '@/i18n';
import type { AppLang } from '@/stores/settingsStore';

/**
 * Translate a place-order failure into localized, user-facing copy, while
 * classifying whether the outcome is UNKNOWN (transport-level failure with no
 * server response) vs DEFINITE (the server responded with a status).
 *
 * Transaction-safety rule: `uncertain` means the backend may or may not have
 * created the order. The checkout surface renders a dedicated "status
 * uncertain" state for these and never auto-retries — only an explicit user
 * tap places an order again (no idempotency mechanism is verified).
 */

export interface OrderPlaceError {
  kind: 'uncertain' | 'error';
  message: string;
}

export function classifyPlaceOrderError(lang: AppLang, error: unknown): OrderPlaceError {
  if (!isApiError(error)) {
    return { kind: 'uncertain', message: t(lang, 'errUnexpected') };
  }

  const e = error as ApiError;

  // No response at all (network down) or a timeout: we cannot know if the
  // backend processed the request. This deserves the uncertain state.
  if (!e.isServerResponse) {
    return {
      kind: 'uncertain',
      message: e.kind === 'timeout' ? t(lang, 'errTimeout') : t(lang, 'errNetwork'),
    };
  }

  switch (e.kind) {
    case 'http':
      if (e.status === 401 || e.status === 403) {
        return { kind: 'error', message: t(lang, 'errAuthExpired') };
      }
      if (e.status === 500) {
        return { kind: 'error', message: t(lang, 'errServer') };
      }
      return {
        kind: 'error',
        message: tMsg(lang, e.message) || t(lang, 'errOrderPlaceFailed'),
      };
    default:
      return {
        kind: 'error',
        message: tMsg(lang, e.message) || t(lang, 'errOrderPlaceFailed'),
      };
  }
}

/** Phone PATCH failures reuse the same transport/status mapping (no uncertain state). */
export function phoneUpdateErrorMessage(lang: AppLang, error: unknown): string {
  if (!isApiError(error)) return t(lang, 'errPhoneUpdateFailed');
  const e = error as ApiError;
  if (!e.isServerResponse) {
    return e.kind === 'timeout' ? t(lang, 'errTimeout') : t(lang, 'errNetwork');
  }
  switch (e.kind) {
    case 'http':
      if (e.status === 401 || e.status === 403) return t(lang, 'errAuthExpired');
      if (e.status === 500) return t(lang, 'errServer');
      return tMsg(lang, e.message) || t(lang, 'errPhoneUpdateFailed');
    default:
      return tMsg(lang, e.message) || t(lang, 'errPhoneUpdateFailed');
  }
}