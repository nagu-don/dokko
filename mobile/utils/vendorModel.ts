import { t } from '@/i18n';
import type { AppLang } from '@/stores/settingsStore';
import type { VendorProfile } from '@/types';

/**
 * Vendor presentation model (Phase 9).
 *
 * Everything here is DERIVED from the server's authoritative fields — the app
 * never overwrites `status`/`priorityStage` and never computes distance or
 * matching. Readiness is `hasSetLocation` because that is the ONLY field the
 * backend exposes to a vendor to gate request eligibility (getVendorProfile).
 * `isAvailable` is not readable by vendors; see vendorService.ts.
 */
export function isVendorReady(profile: VendorProfile | null | undefined): boolean {
  return profile?.hasSetLocation === true;
}

/** Controlled mapping of backend order status -> localized label (new list only shows Pending). */
export function vendorOrderStatusLabel(lang: AppLang, status: string): string {
  switch (status) {
    case 'Pending':
      return t(lang, 'vendorStatusPending');
    case 'Processing':
      return t(lang, 'vendorStatusProcessing');
    case 'Delivered':
      return t(lang, 'vendorStatusDelivered');
    case 'Cancelled':
      return t(lang, 'vendorStatusCancelled');
    default:
      return status || t(lang, 'vendorStatusPending');
  }
}

/** Friendly priority-stage line — SAME backend value space as the customer side. */
export function vendorPriorityStageLabel(lang: AppLang, stage: string): string {
  switch (stage) {
    case 'SEARCHING_0_5KM':
      return t(lang, 'stageSearchingClose');
    case 'SEARCHING_1KM':
      return t(lang, 'stageSearchingWide');
    case 'SEARCHING_CLOSEST':
      return t(lang, 'stageFindingClosest');
    case 'ASSIGNED':
      return t(lang, 'stageAssigned');
    case 'NO_VENDOR_AVAILABLE':
      return t(lang, 'stageNoVendor');
    default:
      return stage || '';
  }
}

/** Server-computed distance badge, formatted for display. */
export function vendorDistanceLabel(lang: AppLang, km: number | undefined): string {
  if (typeof km !== 'number') return '';
  return t(lang, 'vendorDistanceUnit', { km });
}

/** Whole seconds remaining until a priority stage's expiry. */
export const VENDOR_EXPIRY_URGENT_SECONDS = 10;

/**
 * Seconds until `priorityExpiresAt`, or null when the stage carries no expiry
 * (priorityExpiresAt null — final stage, e.g. SEARCHING_CLOSEST) or the window
 * has already passed. Purely client-side countdown against the server-provided
 * timestamp — never triggers a refetch.
 */
export function vendorPrioritySecondsLeft(
  priorityExpiresAt: string | null | undefined,
  now: number = Date.now()
): number | null {
  if (!priorityExpiresAt) return null;
  const expiry = new Date(priorityExpiresAt).getTime();
  if (!Number.isFinite(expiry)) return null;
  const secondsLeft = Math.ceil((expiry - now) / 1000);
  return secondsLeft > 0 ? secondsLeft : null;
}

/**
 * Controlled mapping of ORDER-level payment status (order.paymentStatus — the
 * vendor's view) to a localized, vendor-appropriate label. Values come from
 * orderModel.js PAYMENT_STATUSES.
 */
export function vendorPaymentStatusLabel(
  lang: AppLang,
  value: string | null | undefined
): string {
  switch (value) {
    case 'unpaid':
      return t(lang, 'vendorPaymentStatusUnpaid');
    case 'pending':
      return t(lang, 'vendorPaymentStatusPending');
    case 'paid':
      return t(lang, 'vendorPaymentStatusPaid');
    case 'completed':
      return t(lang, 'vendorPaymentStatusCompleted');
    case 'failed':
      return t(lang, 'vendorPaymentStatusFailed');
    default:
      return value || t(lang, 'vendorPaymentStatusUnpaid');
  }
}