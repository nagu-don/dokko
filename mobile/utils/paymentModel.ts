import { t } from '@/i18n';
import type { AppLang } from '@/stores/settingsStore';
import type {
  OrderPaymentState,
  OrderPaymentStatus,
  PaymentProvider,
  PaymentStatus,
  PaymentViewState,
} from '@/types';

/**
 * Payment presentation model (customer, Phase 8C). Everything is DERIVED from
 * the server's authoritative state — the app never decides whether money was
 * paid. The backend state machine (paymentModel.js + paymentController.js):
 *
 *   active:      created -> qr_generated | awaiting_payment (TTL 15 min)
 *   received:    awaiting_payment -> payment_received (retryable by verify)
 *   terminal:    payment_verified | payment_failed | payment_expired
 *                | cancelled | amount_mismatch | cash_recorded
 *
 * A new attempt is only allowed while `canInitiate` is true (order payable
 * AND no `payment_received` sitting unconfirmed).
 */

/** Attempt statuses still "in flight" (a live payment could complete). */
export const ACTIVE_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'created',
  'qr_generated',
  'awaiting_payment',
];

/** Attempt statuses that can no longer progress towards a payment. */
export const TERMINAL_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'payment_verified',
  'payment_failed',
  'payment_expired',
  'cancelled',
  'amount_mismatch',
  'cash_recorded',
];

export function isActivePaymentStatus(status?: PaymentStatus): boolean {
  return !!status && ACTIVE_PAYMENT_STATUSES.includes(status);
}

export function isTerminalPaymentStatus(status?: PaymentStatus): boolean {
  return !!status && TERMINAL_PAYMENT_STATUSES.includes(status);
}

/**
 * Which UI state the payment screen should render for the current server
 * payload. `payment_received` is deliberately NOT terminal — the money is in
 * but still needs server confirmation, so the UI stays in "pending".
 */
export function paymentViewState(state: OrderPaymentState | undefined): PaymentViewState {
  if (!state || !state.paymentRequired) return 'notRequired';
  if (!state.payment) return 'needsAction';

  switch (state.payment.status) {
    case 'payment_verified':
      return 'success';
    case 'payment_expired':
      return 'expired';
    case 'payment_failed':
    case 'cancelled':
    case 'amount_mismatch':
      return 'failed';
    default:
      return 'pending';
  }
}

/** Controlled mapping of payment ATTEMPT statuses to localized strings. */
export function paymentStatusLabel(lang: AppLang, status: PaymentStatus | undefined): string {
  switch (status) {
    case 'created':
    case 'qr_generated':
    case 'awaiting_payment':
      return t(lang, 'paymentStatusPending');
    case 'payment_received':
      return t(lang, 'paymentStatusReceived');
    case 'payment_verified':
      return t(lang, 'paymentStatusVerified');
    case 'payment_failed':
      return t(lang, 'paymentStatusFailed');
    case 'payment_expired':
      return t(lang, 'paymentStatusExpired');
    case 'cancelled':
      return t(lang, 'paymentStatusCancelled');
    case 'amount_mismatch':
      return t(lang, 'paymentStatusMismatch');
    case 'cash_recorded':
      return t(lang, 'paymentStatusCash');
    default:
      return status || '';
  }
}

/** Controlled mapping of gateway provider keys to localized strings. */
export function providerLabel(lang: AppLang, provider: PaymentProvider | undefined): string {
  switch (provider) {
    case 'mock':
      return t(lang, 'providerMock');
    case 'fonepay':
      return t(lang, 'providerFonepay');
    case 'cash':
      return t(lang, 'providerCash');
    default:
      return provider || '';
  }
}

/** Controlled mapping of ORDER-level payment status to localized strings. */
export function orderPaymentStatusLabel(
  lang: AppLang,
  value: string | null | undefined
): string {
  switch (value as OrderPaymentStatus) {
    case 'unpaid':
      return t(lang, 'orderPaymentStatusUnpaid');
    case 'pending':
      return t(lang, 'orderPaymentStatusPending');
    case 'paid':
      return t(lang, 'orderPaymentStatusPaid');
    case 'failed':
      return t(lang, 'orderPaymentStatusFailed');
    case 'refunded':
      return t(lang, 'orderPaymentStatusRefunded');
    case 'completed':
      return t(lang, 'orderPaymentStatusCompleted');
    default:
      return value || '';
  }
}