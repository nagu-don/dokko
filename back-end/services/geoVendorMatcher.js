import vendorModel from "../models/vendorModel.js";
import { DELIVERY_MAX_KM, EARTH_RADIUS_KM, STAGE_RADIUS_KM } from "../config/priorityConfig.js";

// ── constants ──────────────────────────────────────────────────
// Earth's mean radius in kilometres.  Distances are computed with the
// haversine formula in JS after `$geoWithin $centerSphere` returns the
// candidate vendors (MongoDB's `$geoNear` distance output proved
// unreliable on the target Atlas deployment, returning absurd radian
// distances for points a fraction of a km away — see the hardening
// test diagnostics.  `$geoWithin` + haversine is index-backed and
// exact, so we use that instead).

// ── shared eligibility filter ─────────────────────────────────
// Conditions:
//   1. hasSetLocation = true
//      — vendor has picked a real working location on the map.
//        Vendors on the default Kathmandu fallback are excluded.
//   2. location exists and is a valid GeoJSON Point
//      — defensive: prevents null/malformed location from
//        entering geospatial queries.
//   3. isAvailable != false
//      — when the isAvailable field exists and is explicitly false,
//        the vendor is excluded.  When the field does not exist on
//        legacy documents, the vendor remains eligible (missing
//        fields do not match { $ne: false }).
const buildEligibilityFilter = () => ({
  hasSetLocation: true,
  "location.type": "Point",
  "location.coordinates": { $exists: true, $ne: [] },
  isAvailable: { $ne: false },
});

// distance in km between two [lng, lat] points (haversine)
const haversineKm = (coordsA, coordsB) => {
  const [lng1, lat1] = coordsA;
  const [lng2, lat2] = coordsB;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const shapeVendor = (v, dropoffCoords) => ({
  _id: v._id,
  name: v.name,
  phone: v.phone,
  location: v.location,
  distanceKm: v.location?.coordinates
    ? Math.round(haversineKm(dropoffCoords, v.location.coordinates) * 10) / 10
    : 0,
});

// ── internal: vendors within a radius ─────────────────────────
//
// Uses MongoDB's `$geoWithin $centerSphere` with the 2dsphere index
// on vendors.location.  `$centerSphere` takes the radius directly in
// kilometres (converted to radians) and is exact — it has been
// verified against `$geoNear`, which returned corrupt distances on
// the target Atlas deployment.  The returned vendors are then
// projected and their distance computed with the haversine formula.
//
// @param {number[]} dropoffCoords  — [lng, lat] GeoJSON coordinates
// @param {number}   radiusKm       — maximum distance in kilometres
// @returns {Promise<Array>}        — vendors within the radius
const findVendorsWithinRadius = async (dropoffCoords, radiusKm) => {
  const radiusRadians = radiusKm / EARTH_RADIUS_KM;

  const results = await vendorModel
    .find({
      ...buildEligibilityFilter(),
      location: {
        $geoWithin: {
          $centerSphere: [dropoffCoords, radiusRadians],
        },
      },
    })
    .select({ _id: 1, name: 1, phone: 1, location: 1 })
    .lean();

  const shaped = results
    .map((v) => shapeVendor(v, dropoffCoords))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  return shaped;
};

// ── public API ─────────────────────────────────────────────────

/**
 * Find eligible vendors for a priority search stage.
 *
 * Returns vendors (and their distance from the drop-off) that are
 * eligible for the given stage.  This function does NOT calculate
 * or assign the delivery charge — that is the caller's responsibility.
 *
 * SEARCHING_CLOSEST returns the single nearest eligible vendor within
 * DELIVERY_MAX_KM of the drop-off; when none exists, no vendor is
 * offered (order ends as NO_VENDOR_AVAILABLE).
 *
 * @param {string}  stage        — "SEARCHING_0_5KM" | "SEARCHING_1KM" | "SEARCHING_CLOSEST"
 * @param {number[]} dropoffCoords — [lng, lat] GeoJSON coordinates of the customer's drop-off
 * @returns {Promise<{ vendors: Array, stage: string }>}
 *   vendors — array of { _id, name, phone, location, distanceKm }
 *   stage   — the stage that was queried (pass-through for convenience)
 */
export const findEligibleVendors = async (stage, dropoffCoords) => {
  if (!Array.isArray(dropoffCoords) || dropoffCoords.length !== 2) {
    return { vendors: [], stage };
  }

  const [lng, lat] = dropoffCoords;

  // Reject non-finite OR out-of-bounds coordinates.  A malformed drop-off
  // (NaN/Infinity, or lon/lat outside their valid ranges) must NEVER enter a
  // geospatial query — MongoDB rejects out-of-range coordinates with a hard
  // error, and an invalid drop-off should simply yield no eligible vendors.
  const finite = Number.isFinite(lng) && Number.isFinite(lat);
  const inBounds = lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;

  if (!finite || !inBounds) {
    return { vendors: [], stage };
  }

  switch (stage) {
    case "SEARCHING_0_5KM": {
      const vendors = await findVendorsWithinRadius(dropoffCoords, STAGE_RADIUS_KM.SEARCHING_0_5KM);
      return { vendors, stage };
    }

    case "SEARCHING_1KM": {
      const vendors = await findVendorsWithinRadius(dropoffCoords, STAGE_RADIUS_KM.SEARCHING_1KM);
      return { vendors, stage };
    }

    case "SEARCHING_CLOSEST": {
      // Single nearest eligible vendor within the service area cap —
      // beyond DELIVERY_MAX_KM there is no service (NO_VENDOR_AVAILABLE).
      const vendors = await findVendorsWithinRadius(dropoffCoords, DELIVERY_MAX_KM);
      return { vendors: vendors.slice(0, 1), stage };
    }

    default:
      return { vendors: [], stage };
  }
};

/**
 * Determine which priority stage an order should advance to.
 *
 * Pure function — no database access.  Used by the stage-advancement
 * logic (scheduler/timer) to decide the next stage.
 *
 * @param {string} currentStage — current priorityStage of the order
 * @returns {string|null}       — next stage, or null if already terminal
 */
export const nextStage = (currentStage) => {
  switch (currentStage) {
    case "SEARCHING_0_5KM": return "SEARCHING_1KM";
    case "SEARCHING_1KM":   return "SEARCHING_CLOSEST";
    default:                return null; // SEARCHING_CLOSEST or ASSIGNED — no further stages
  }
};
