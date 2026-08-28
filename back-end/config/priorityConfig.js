/**
 * Priority-search configuration — single source of truth.
 *
 * All priority-search business rules (radii, delivery charges, stage
 * duration) live here and ONLY here.  Consumers import from this module
 * rather than hardcoding 0.5 / 1 / 50 / 75 / 120 / 60 anywhere.
 *
 * NOTE: `PRIORITY_DELIVERY_CHARGES` remains exported from
 * models/orderModel.js for backward compatibility with existing test and
 * controller imports; it is derived from this config so the values can
 * never drift.
 */

// Earth's mean radius in km — used to convert between km and the
// radians that MongoDB's spherical operators expect.
export const EARTH_RADIUS_KM = 6371;

export const PRIORITY_CONFIG = {
  // search radii (km)
  NEAR_RADIUS_KM: 0.5,          // SEARCHING_0_5KM
  EXTENDED_RADIUS_KM: 1,        // SEARCHING_1KM

  // delivery charges set ONLY on vendor acceptance (NRs)
  NEAR_CHARGE: 50,              // SEARCHING_0_5KM acceptance
  EXTENDED_CHARGE: 75,          // SEARCHING_1KM acceptance
  FALLBACK_CHARGE: 120,         // SEARCHING_CLOSEST acceptance

  // stage window
  STAGE_DURATION_SECONDS: 60,

  // scheduler tuning
  SCHEDULER_POLL_INTERVAL_MS: 15_000,
  SCHEDULER_STUCK_THRESHOLD_MS: 180_000,
};

// milliseconds for a single search stage window
export const STAGE_DURATION_MS = PRIORITY_CONFIG.STAGE_DURATION_SECONDS * 1000;

// per-stage delivery charge map — keyed by priority stage name
export const PRIORITY_DELIVERY_CHARGES = {
  SEARCHING_0_5KM: PRIORITY_CONFIG.NEAR_CHARGE,
  SEARCHING_1KM: PRIORITY_CONFIG.EXTENDED_CHARGE,
  SEARCHING_CLOSEST: PRIORITY_CONFIG.FALLBACK_CHARGE,
};

// per-stage radius in km
export const STAGE_RADIUS_KM = {
  SEARCHING_0_5KM: PRIORITY_CONFIG.NEAR_RADIUS_KM,
  SEARCHING_1KM: PRIORITY_CONFIG.EXTENDED_RADIUS_KM,
};

// per-stage radius in radians (what MongoDB spherical ops expect)
export const STAGE_RADIUS_RADIANS = {
  SEARCHING_0_5KM: PRIORITY_CONFIG.NEAR_RADIUS_KM / EARTH_RADIUS_KM,
  SEARCHING_1KM: PRIORITY_CONFIG.EXTENDED_RADIUS_KM / EARTH_RADIUS_KM,
};
