import { t } from '@/i18n';
import type { AppLang } from '@/stores/settingsStore';
import type { OrderBucket, OrderRead, PriorityStage } from '@/types';

/**
 * Customer order presentation model. Everything here is DERIVED from the
 * server's authoritative `status` + `priorityStage` fields — the app never
 * overwrites them. The backend state machine (verified in
 * back-end/services/priorityService.js + orderModel.js):
 *
 *   status:      Pending -> Processing -> Delivered | Cancelled
 *   priorityStage: SEARCHING_0_5KM -> SEARCHING_1KM -> SEARCHING_CLOSEST
 *                    -> NO_VENDOR_AVAILABLE (terminal) | ASSIGNED
 *
 * A vendor Accept sets status=Processing + priorityStage=ASSIGNED.
 */

/** Order "location" in the customer's life — drives the active/history split. */
export function orderBucket(order: OrderRead): OrderBucket {
  if (order.status === 'Cancelled') return 'cancelled';
  if (order.status === 'Delivered') return 'completed';
  if (order.priorityStage === 'NO_VENDOR_AVAILABLE') return 'failed';
  return 'active';
}

/** True once the order can no longer progress without human/vendor action. */
export function isOrderTerminal(order: OrderRead): boolean {
  const bucket = orderBucket(order);
  return bucket === 'completed' || bucket === 'cancelled' || bucket === 'failed';
}

/** Human display code — "#" + last 6 of the id uppercased (web parity). */
export function orderCode(order: OrderRead): string {
  const tail = order._id.slice(-6);
  return `#${tail.toUpperCase()}`;
}

/** Controlled mapping of backend status values to localized strings. */
export function orderStatusLabel(lang: AppLang, order: OrderRead): string {
  switch (order.status) {
    case 'Pending':
      return t(lang, 'orderStatusPending');
    case 'Processing':
      return t(lang, 'orderStatusProcessing');
    case 'Delivered':
      return t(lang, 'orderStatusDelivered');
    case 'Cancelled':
      return t(lang, 'orderStatusCancelled');
    default:
      return order.status || t(lang, 'orderStatusUnknown');
  }
}

/**
 * Friendly priority-stage line shown while searching. Each string maps to a
 * REAL backend stage — no fabricated progress or countdown.
 */
export function priorityStageLabel(lang: AppLang, order: OrderRead): string {
  switch (order.priorityStage as PriorityStage) {
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
      return order.priorityStage || '';
  }
}

/** Whether an order is still being searched for a vendor (poll-worthy). */
export function isSearching(order: OrderRead): boolean {
  return (
    order.priorityStage === 'SEARCHING_0_5KM' ||
    order.priorityStage === 'SEARCHING_1KM' ||
    order.priorityStage === 'SEARCHING_CLOSEST'
  );
}
