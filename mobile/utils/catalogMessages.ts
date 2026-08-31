import { t, tMsg } from '@/i18n';
import { isApiError, type ApiError } from '@/services/api';
import type { AppLang } from '@/stores/settingsStore';

/**
 * Turn a catalog ApiError into friendly, localized copy.
 * Mirrors the auth error mapping: transport/timeout/server classes get
 * dedicated keys, server-sent messages pass through `tMsg` (unknown ones
 * return verbatim — the backend's own messages are already human).
 */
export function catalogErrorMessage(lang: AppLang, error: unknown): string {
  if (!isApiError(error)) return t(lang, 'errUnexpected');
  const e = error as ApiError;

  switch (e.kind) {
    case 'network':
      return t(lang, 'errNetwork');
    case 'timeout':
      return t(lang, 'errTimeout');
    case 'http':
      if (e.status === 401 || e.status === 403) {
        return t(lang, 'errAuthExpired');
      }
      if (e.status === 500) {
        return t(lang, 'errServer');
      }
      return tMsg(lang, e.message) || t(lang, 'errUnexpected');
    default:
      return tMsg(lang, e.message) || t(lang, 'errUnexpected');
  }
}