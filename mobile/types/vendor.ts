import type { LatLng } from './location';

/**
 * GET /api/vendors/me response `data`. Note this shape uses `id` (not `_id`),
 * `{ lat, lng }` coordinates and a MASKED payout account number.
 *
 * `isAvailable` intentionally does NOT appear here: the backend does not
 * expose a vendor-facing read/write endpoint for it (it is only consulted
 * server-side during accept). The app must not fabricate an availability
 * state — see mobileref.txt Phase 9 notes.
 */
export interface VendorProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  hasSetLocation: boolean;
  location?: LatLng | null;
  payoutMethod?: 'bank' | string;
  payoutAccountHolder?: string | null;
  payoutBankName?: string | null;
  payoutAccountNumber?: string | null;
}

/** PATCH /api/vendors/location request body (`{lat,lng}` — matches backend). */
export interface UpdateVendorLocationInput {
  lat: number;
  lng: number;
}

/** PATCH /api/vendors/payout request body. */
export interface UpdateVendorPayoutInput {
  payoutMethod: 'bank';
  payoutAccountHolder: string;
  payoutBankName: string;
  payoutAccountNumber: string;
}

/**
 * One broadcast notice from GET /api/vendors/notices (authVendor).
 *
 * Bilingual title/body fields mirror the backend noticeModel (titleEn/titleNp/
 * bodyEn/bodyNp). The app renders the active language with a fallback to the
 * other language — the content is data from the server, never run through `t()`.
 * Sorted server-side by createdAt desc (limit 100).
 */
export interface VendorNotice {
  id: string;
  titleEn: string;
  titleNp: string;
  bodyEn: string;
  bodyNp: string;
  createdAt: string;
}

/** One aggregated item row from GET /api/vendors/summary. */
export interface VendorSummaryItem {
  nameEng: string;
  nameNep: string;
  unitEng?: string;
  unitNep?: string;
  quantity: number;
  pricePerKg: number;
  lineTotal: number;
}

/**
 * One line of an order as the vendor sees it. This is the ORDER SNAPSHOT
 * (historical), not the current catalog: a renamed/re-priced item stays as it
 * was when the customer ordered.
 */
export interface VendorRequestItem {
  nameEng: string;
  nameNep?: string;
  unitEng?: string;
  unitNep?: string;
  quantity: number;
  priceAtOrder: number;
}

/** Delivery point picked by the customer — `{lat,lng,label}` (NOT GeoJSON). */
export interface VendorRequestDropoff {
  lat: number;
  lng: number;
  label?: string;
}

/**
 * Shape of an order the vendor is offered — GET /api/vendors/requests/new
 * `data` elements (`presentOrder`). Field names/values come straight from the
 * backend shape (back-end/controllers/vendorController.js `presentOrder`):
 *
 *  - `distanceKm` is server-computed (present only when the vendor's location
 *    is set and the order has a dropoff) — the app NEVER recomputes distance.
 *  - `isClosestVendor` is server-computed for final-stage orders.
 *  - `subtotal` is the items-only amount; delivery/additional charges do not
 *    belong to the vendor and are shown as informational only.
 */
export interface VendorPresentedOrder {
  id: string;
  code: string; // "#" + last 6 id chars, uppercased by the backend
  customer: { name: string; phone: string; email: string };
  dropoff?: VendorRequestDropoff | null;
  items: VendorRequestItem[];
  totalQuantity: number;
  subtotal: number;
  deliveryCharge: number | null;
  additionalCharges: number;
  total: number;
  status: string;
  paymentStatus?: string;
  paymentMethod?: string | null;
  acceptedAt?: string | null;
  completedAt?: string | null;
  priorityStage: string;
  createdAt?: string;
  distanceKm?: number;
  isClosestVendor?: boolean;
}