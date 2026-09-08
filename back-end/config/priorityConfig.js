/**
 * Priority-search configuration — single source of truth.
 *
 * All priority-search business rules (radii, distance-based delivery
 * tariffs, stage duration) live here and ONLY here.  Consumers import
 * from this module rather than hardcoding 0.5 / 1 / 25 / 30 / 60
 * anywhere.
 */

// Earth's mean radius in km — used to convert between km and the
// radians that MongoDB's spherical operators expect.
export const EARTH_RADIUS_KM = 6371;

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

// Maximum delivery distance in km — beyond this, no vendor can fulfil
// an order (the order ends as NO_VENDOR_AVAILABLE).  Set by .env.
export const DELIVERY_MAX_KM = num(process.env.DELIVERY_MAX_KM, 5);

// ── distance-based delivery tariff (NRs) ──────────────────────
// Ascending band, distance between the vendor and the drop-off at the
// moment the vendor accepts.  Each charge is read from .env
// (DELIVERY_CHARGE_*) and falls back to the value below when unset.
// Bands past DELIVERY_MAX_KM are unreachable (no service).
const FIXED_TARIFF_BANDS = [
  { envKey: "DELIVERY_CHARGE_0_300M",  maxKm: 0.3, fallback: 25 },
  { envKey: "DELIVERY_CHARGE_301_500M", maxKm: 0.5, fallback: 30 },
  { envKey: "DELIVERY_CHARGE_501M_1KM", maxKm: 1,   fallback: 50 },
  { envKey: "DELIVERY_CHARGE_1_2KM",    maxKm: 2,   fallback: 75 },
  { envKey: "DELIVERY_CHARGE_2_3KM",    maxKm: 3,   fallback: 100 },
  { envKey: "DELIVERY_CHARGE_3_4KM",    maxKm: 4,   fallback: 125 },
  { envKey: "DELIVERY_CHARGE_4_5KM",    maxKm: 5,   fallback: 150 },
];

export const DELIVERY_TARIFF_BANDS = FIXED_TARIFF_BANDS
  .filter((b) => b.maxKm <= DELIVERY_MAX_KM)
  .map((b) => ({ maxKm: b.maxKm, charge: num(process.env[b.envKey], b.fallback) }));

// delivery charge (NRs) for a given distance in km, or null when the
// distance is outside the service area (> DELIVERY_MAX_KM).
export const deliveryChargeForKm = (distanceKm) => {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return null;
  for (const band of DELIVERY_TARIFF_BANDS) {
    if (distanceKm <= band.maxKm) return band.charge;
  }
  return null;
};

export const PRIORITY_CONFIG = {
  // search radii (km)
  NEAR_RADIUS_KM: 0.5,          // SEARCHING_0_5KM
  EXTENDED_RADIUS_KM: 1,        // SEARCHING_1KM

  DELIVERY_MAX_KM,
  DELIVERY_TARIFF_BANDS,

  // stage window
  STAGE_DURATION_SECONDS: 60,

  // scheduler tuning
  SCHEDULER_POLL_INTERVAL_MS: 15_000,
  SCHEDULER_STUCK_THRESHOLD_MS: 180_000,
};

// milliseconds for a single search stage window
export const STAGE_DURATION_MS = PRIORITY_CONFIG.STAGE_DURATION_SECONDS * 1000;

// per-stage radius in km — SEARCHING_CLOSEST has no per-stage radius,
// it is bounded by DELIVERY_MAX_KM instead
export const STAGE_RADIUS_KM = {
  SEARCHING_0_5KM: PRIORITY_CONFIG.NEAR_RADIUS_KM,
  SEARCHING_1KM: PRIORITY_CONFIG.EXTENDED_RADIUS_KM,
};

// per-stage radius in radians (what MongoDB spherical ops expect)
export const STAGE_RADIUS_RADIANS = {
  SEARCHING_0_5KM: PRIORITY_CONFIG.NEAR_RADIUS_KM / EARTH_RADIUS_KM,
  SEARCHING_1KM: PRIORITY_CONFIG.EXTENDED_RADIUS_KM / EARTH_RADIUS_KM,
};