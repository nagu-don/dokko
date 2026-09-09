import { t, tMsg } from '@/i18n';
import type { AppLang } from '@/stores/settingsStore';
import type { AuthAttempt } from '@/types';

/**
 * Turn an AuthAttempt failure into user-friendly, localized copy.
 *
 * Transport failures (no network / timeout) and clear-cut server statuses map
 * to dedicated keys. Server `success:false` / validation messages go through
 * `tMsg`, which only localizes known server messages and returns unknown ones
 * verbatim (safe because the backend's own messages are already human).
 */
export function authAuthErrorMessage(
  lang: AppLang,
  attempt: AuthAttempt | null | undefined
): string {
  if (!attempt || attempt.ok || !attempt.message) return '';

  switch (attempt.kind) {
    case 'network':
      return t(lang, 'errNetwork');
    case 'timeout':
      return t(lang, 'errTimeout');
    case 'http':
      if (attempt.status === 401 || attempt.status === 403) {
        // Backend uses 401/403 for bad Google credentials / auth failures.
        return tMsg(lang, attempt.message) || t(lang, 'errInvalidCredentials');
      }
      if (attempt.status === 429) {
        // Rate-limited (too many login/registration attempts) — generic, no
        // account-existence info leaked.
        return t(lang, 'errTooManyAttempts');
      }
      if (attempt.status === 500) {
        return t(lang, 'errServer');
      }
      return tMsg(lang, attempt.message) || t(lang, 'errUnexpected');
    default:
      return tMsg(lang, attempt.message) || t(lang, 'errUnexpected');
  }
}
