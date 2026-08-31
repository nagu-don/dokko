import type { CartItem, Item } from '@/types';
import { round1, round2 } from '@/utils/format';

/**
 * Pure cart derivations shared by the cart screen and the badge. Kept
 * framework-free so every screen uses IDENTICAL math (and it is trivially
 * testable). Price/SNAPSHOT policy: render-time price prefers the LIVE
 * approved-catalog `maxPrice` when the item still exists; otherwise the
 * persisted snapshot price. The backend re-snapshots at order placement.
 */

export interface ResolvedCartLine {
  line: CartItem;
  /** Live approved catalog item for the same `_id`, when known. */
  live?: Item;
}

export function cartTotalKg(lines: CartItem[]): number {
  return round1(lines.reduce((sum, l) => sum + l.quantityKg, 0));
}

export function cartLineCount(lines: CartItem[]): number {
  return lines.length;
}

/** Price charged on the screen: live max price when available, else snapshot. */
export function cartLinePrice(line: CartItem, live?: Item): number {
  if (live) {
    const livePrice = Number(live.maxPrice);
    if (Number.isFinite(livePrice) && livePrice > 0) return livePrice;
  }
  return line.price;
}

export function cartLineTotal(line: CartItem, live?: Item): number {
  return round2(line.quantityKg * cartLinePrice(line, live));
}

export function cartSubtotal(lines: CartItem[], byId?: Map<string, Item>): number {
  return round2(
    lines.reduce((sum, l) => sum + cartLineTotal(l, byId?.get(l.itemId)), 0)
  );
}

/** Align every line with its live catalog record, when present. */
export function resolveCartLines(lines: CartItem[], byId?: Map<string, Item>): ResolvedCartLine[] {
  return lines.map((line) => ({ line, live: byId?.get(line.itemId) }));
}