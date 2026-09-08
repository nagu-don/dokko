/** API wire format for coordinates — always `{ lat, lng }` (numbers). */
export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Dropoff target accepted by POST /api/orders/place.
 *  - `label` is the NOTE the customer writes "for the vendor" — this is the
 *    single string that travels to the order and is shown to the vendor.
 *  - `name` is an optional friendly label the customer keeps for themselves
 *    (e.g. "Home") and is shown only in their own settings, never sent with
 *    the order.
 */
export interface Dropoff {
  lat: number;
  lng: number;
  /** Note for the vendor — this is what the vendor sees. */
  label?: string;
  /** Customer-facing friendly name (local only, not sent to the vendor). */
  name?: string;
}

/**
 * Live vendor location — GET /api/orders/:orderId/vendor-location `data.location`.
 * Distributable ONLY while the order is Processing (assigned). `lastUpdatedAt`
 * is the SERVER timestamp recorded when the vendor last reported a position, so
 * the UI can show how fresh the data is and must never present stale coords as
 * live. This is the dedicated `liveLocation` field — NEVER the static
 * `location` used for geo-matching.
 */
export interface VendorLiveLocation {
  lat: number;
  lng: number;
  lastUpdatedAt: string | null;
}

/**
 * Full payload returned by GET /api/orders/:orderId/vendor-location.
 *  - `tracking` is server-authoritative: false until the order is assigned AND
 *    Processing, and false again once it reaches a terminal state.
 *  - `location` is null when no fresh live position has been reported yet.
 */
export interface OrderVendorLocationResponse {
  tracking: boolean;
  vendor?: { id: string; name?: string } | null;
  location: VendorLiveLocation | null;
}