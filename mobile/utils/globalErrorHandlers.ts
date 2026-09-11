import { reportIssue } from '@/services/issues/reportIssue';
import { enable as enablePromiseRejectionTracking } from 'promise/setimmediate/rejection-tracking';

type GlobalErrorHandler = (error: unknown, isFatal: boolean) => void;

interface ErrorUtilsLike {
  getGlobalHandler?: () => GlobalErrorHandler;
  setGlobalHandler?: (handler: GlobalErrorHandler) => void;
}

interface HermesTrackerOptions {
  allRejections?: boolean;
  onUnhandled?: (id: number, rejection: unknown) => void;
  onHandled?: (id: number) => void;
}

interface HermesInternalLike {
  enablePromiseRejectionTracker?: (options: HermesTrackerOptions) => unknown;
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function errorStack(value: unknown): string | undefined {
  return value instanceof Error ? value.stack : undefined;
}

let wired = false;

/**
 * Global unhandled-error capture (mobile).
 *
 * 1. Wraps React Native's `ErrorUtils.setGlobalHandler` so EVERY uncaught JS
 *    exception (fatal or not) is reported to the backend. The previous handler
 *    is preserved so React Native's dev redbox / native crash reporting still
 *    runs.
 * 2. Wires promise-rejection tracking for unhandled rejections, preferring the
 *    Hermes runtime's native tracker (default engine) and falling back to the
 *    `promise` npm package's tracker for JS-land Promise polyfills. Reports
 *    each unhandled rejection via `reportIssue` without swallowing it.
 */
export function wireGlobalErrorReporting(): void {
  if (wired) return;
  wired = true;

  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (errorUtils?.setGlobalHandler) {
    const previous = errorUtils.getGlobalHandler?.();
    errorUtils.setGlobalHandler((error: unknown, isFatal: boolean) => {
      reportIssue({
        type: 'unhandled_error',
        message: errorMessage(error),
        stack: errorStack(error),
        severity: isFatal ? 'critical' : 'high',
      });
      if (previous) {
        previous(error, isFatal);
      }
    });
  }

  wirePromiseRejectionTracking();
}

function wirePromiseRejectionTracking(): void {
  const hermes = (globalThis as { HermesInternal?: HermesInternalLike })
    .HermesInternal;

  if (typeof hermes?.enablePromiseRejectionTracker === 'function') {
    try {
      hermes.enablePromiseRejectionTracker({
        allRejections: true,
        onUnhandled: (id: number, rejection: unknown) => {
          reportUnhandledRejection(id, rejection);
        },
        onHandled: () => {},
      });
      return;
    } catch {
      // fall through to the JS-land tracker below
    }
  }

  try {
    enablePromiseRejectionTracking({
      allRejections: true,
      onUnhandled: (id: number, rejection: unknown) => {
        reportUnhandledRejection(id, rejection);
      },
      onHandled: () => {},
    });
  } catch {
    // no rejection tracking available — the global handler still covers crashes
  }
}

function reportUnhandledRejection(id: number, rejection: unknown): void {
  reportIssue({
    type: 'unhandled_error',
    message: errorMessage(rejection),
    stack: errorStack(rejection),
    severity: 'high',
  });
  console.warn('Uncaught (in promise, id: %d): %s', id, errorMessage(rejection));
}