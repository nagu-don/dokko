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