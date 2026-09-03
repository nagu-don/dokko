/** API wire format for coordinates — always `{ lat, lng }` (numbers). */
export interface LatLng {
  lat: number;
  lng: number;
}

/** Dropoff target accepted by POST /api/orders/place. */
export interface Dropoff {
  lat: number;
  lng: number;
  label?: string;
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