import type { ApiEnvelope } from './api';
import type { SearchGroup } from '@/utils/search';

/**
 * Item as returned by GET /api/items/list-approved.
 *
 * The backend serves raw mongoose docs (not a shaped DTO): the identifier is
 * `_id` and every scraper field is present. The `*Nep` price fields are
 * Nepali-digit STRINGS kept in sync by the scraper; the mobile app derives
 * display values from the numeric fields via `money()`/`num()` and never
 * uses `*Nep` as authoritative.
 *
 * `status` true = admin-approved (the endpoint already filters on it).
 * `available` true = the item appears in today's scraped market data
 * (the catalog shows approved items regardless of today's availability,
 * matching the customer web app).
 */
export interface Item {
  _id: string;
  nameEng: string;
  nameNep: string;
  unitEng: string;
  unitNep: string;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  minPriceNep?: string;
  maxPriceNep?: string;
  avgPriceNep?: string;
  /** Filename served under `${API_BASE}/images/<filename>`. */
  image?: string;
  status: boolean;
  available: boolean;
}

export type ApprovedItemsResponse = ApiEnvelope<Item[]>;

/**
 * UI grouping model produced by `buildGroups()` from the search util
 * (grouped by the English base name before its "(...)" suffix). It mirrors
 * the web Explore behavior: one card per base name, variants underneath.
 * `variants` stays typed as `Item[]`.
 */
export type ItemGroup = SearchGroup<Item>;

/**
 * Minimal shape of a customer-selected item/variant, defined in this phase so
 * the future cart consumes one stable object.
 *
 * CANONICAL IDENTITY RULE: a selectable product/variant is ALWAYS identified
 * by the backend item's `_id` (its string form) — a real mongoose doc id, NOT
 * a visual group, index, display name or concatenated string. The order API
 * uses the exact same value as `items[].itemId` and snapshots
 * `priceAtOrder: item.maxPrice` server-side. Therefore:
 *   - `itemId` MUST equal `String(item._id)` of the backend Item;
 *   - `price` MUST be the item's `maxPrice` (the authoritative per-variant
 *     price the backend will charge at order placement).
 */
export interface SelectedItem {
  /** Canonical identifier: the backend item's `_id`. */
  itemId: string;
  nameEng: string;
  nameNep: string;
  unitEng: string;
  unitNep: string;
  /** Authoritative per-variant price = `maxPrice`. */
  price: number;
}

/**
 * A persisted customer-cart line. It extends SelectedItem (so `itemId` is the
 * canonical backend `_id` and `price` is the `maxPrice` snapshot taken when
 * the item was added) plus the quantity (in the item's own unit) and the
 * image filename.
 *
 * STALE-ITEM POLICY: the line keeps its own snapshot (names/unit/price/image)
 * so the cart renders even when the catalog is offline. When the approved
 * catalog cache still contains the `itemId`, the live item's `maxPrice`,
 * name and image are overlaid at render time; lines whose id vanished from
 * the catalog keep their snapshot and remain countable (the badge sums all
 * stored quantities of all-kg carts, or counts lines for mixed-unit carts,
 * matching the web). The backend re-validates existence
 * and re-snapshots the price at ORDER PLACEMENT, so a stale client snapshot
 * can never create a phantom order or overcharge anyone.
 */
export interface CartItem extends SelectedItem {
  /** Quantity in the item's OWN unit: kg items 1-dp, count units whole. */
  quantityKg: number;
  /** Filename served under `${API_BASE}/images/<filename>` (snapshot). */
  image?: string;
}

/** What the details screen hands to the cart when adding a fresh item. */
export type CartAddInput = SelectedItem & { image?: string };