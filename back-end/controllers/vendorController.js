import orderModel from "../models/orderModel.js";
import vendorModel from "../models/vendorModel.js";
import buildAuthController from "./authFactory.js";
import buildGoogleAuthController from "./googleAuthFactory.js";
import axios from "axios";
import { authAdmin } from "../middleware/authMiddleware.js";
import { assignVendor } from "../services/priorityService.js";
import { DELIVERY_MAX_KM, STAGE_RADIUS_KM } from "../config/priorityConfig.js";
import { encryptField, decryptField, maskAccountNumber } from "../utils/fieldEncryption.js";
import logger from "../utils/logger.js";

const { register, login } = buildAuthController(vendorModel);
const { googleAuth } = buildGoogleAuthController(vendorModel);

export const registerVendor = register;
export const loginVendor = login;
export const googleAuthVendor = googleAuth;

// ---- vendor profile incl. working location and payout info ----
export const vendorProfile = async (req, res) => {
  try {
    const v = req.account;
    res.json({
      success: true,
      data: {
        id: v._id,
        name: v.name,
        email: v.email,
        phone: v.phone,
        hasSetLocation: v.hasSetLocation,
        location: {
          lat: v.location?.coordinates?.[1],
          lng: v.location?.coordinates?.[0],
        },
        payoutMethod: v.payoutMethod || null,
        payoutAccountHolder: v.payoutAccountHolder || null,
        payoutBankName: v.payoutBankName || null,
        payoutAccountNumber: v.payoutAccountNumber
          ? maskAccountNumber(decryptField(v.payoutAccountNumber))
          : null,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to load profile");
    res.status(500).json({ success: false, message: "Failed to load profile" });
  }
};

// ---- set / change the "working at" location picked on the map ----
export const updateVendorLocation = async (req, res) => {
  try {
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({
        success: false,
        message: "Valid latitude and longitude are required",
      });
    }

    req.account.location = { type: "Point", coordinates: [lng, lat] };
    req.account.hasSetLocation = true;
    await req.account.save();

    res.json({
      success: true,
      message: "Working location updated",
      data: { lat, lng },
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to update location");
    res.status(500).json({ success: false, message: "Failed to update location" });
  }
};

// Minimum delay (ms) between two live-location writes from the same
// vendor. Guards against runaway GPS loops flooding the database while
// still allowing a responsive ~10s client cadence to pass through.
const LIVE_LOCATION_MIN_INTERVAL_MS = 2000;

// ---- send the vendor's live GPS position during a delivery ----
// Used by the vendor app while an accepted order is being delivered, so
// the assigned customer can watch the courier move in near-real time.
//
// SECURITY BOUNDARY:
//   - Self-only: `req.account` is the authenticated vendor (set by
//     authVendor); we never read the vendor id from the body.
//   - Lifecycle: the vendor may only report a live position while they
//     have an ACTIVE (status === "Processing") order assigned. This means
//     tracking stops as soon as the order is Delivered/Cancelled.
//   - This writes to the dedicated `liveLocation` field, NEVER the static
//     `location` field used for geo-matching.
//   - Coordinates are validated to |lat| <= 90, |lng| <= 180.
//   - `updatedAt` is set server-side (not trusted from the client).
export const updateVendorLiveLocation = async (req, res) => {
  try {
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({
        success: false,
        message: "Valid latitude and longitude are required",
      });
    }

    const vendorId = req.account._id;

    // Lifecycle guard: only report a live location while there is an
    // in-progress order assigned to this vendor. Once every assigned order
    // reaches a terminal state, tracking is no longer allowed.
    const activeOrder = await orderModel.findOne({
      vendor: vendorId,
      status: "Processing",
    });

    if (!activeOrder) {
      return res.status(409).json({
        success: false,
        message: "No active delivery to track",
      });
    }

    // Rate guard: reject updates that come too fast after the previous one.
    const lastUpdate = req.account.liveLocation?.updatedAt
      ? new Date(req.account.liveLocation.updatedAt).getTime()
      : 0;
    if (lastUpdate && Date.now() - lastUpdate < LIVE_LOCATION_MIN_INTERVAL_MS) {
      return res.status(429).json({
        success: false,
        message: "Location update too frequent",
      });
    }

    req.account.liveLocation = {
      type: "Point",
      coordinates: [lng, lat],
      updatedAt: new Date(),
    };
    await req.account.save();

    res.status(200).json({
      success: true,
      message: "Live location updated",
      data: {
        lat,
        lng,
        updatedAt: req.account.liveLocation.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to update live location");
    res.status(500).json({ success: false, message: "Failed to update live location" });
  }
};

// ---- routing proxy for the vendor navigation map ----

// Public OSRM instances the backend relays route requests to. The vendor app
// NEVER sends coordinates to a third-party host directly — it asks the backend
// (POST /api/vendors/route), which tries each instance server-side so a single
// throttled/blocked host never breaks routing.
const OSRM_PROVIDERS = [
  "https://router.project-osrm.org/route/v1/driving",
  "https://routing.openstreetmap.de/routed-car/route/v1/driving",
];

const OSRM_TIMEOUT_MS = 15000;

// POST /api/vendors/route (authVendor)
// Body: { from: { lat, lng }, to: { lat, lng } }
// Returns: { success: true, data: { distance, duration, geometry } } — the exact
// shape the mobile navigation map consumes. Coordinates are validated to the
// same bounds as live location (|lat|<=90, |lng|<=180), the route is picked
// along the path of least distance (matching the previous client-side
// behaviour), and nothing is persisted — this is a pure server-side relay.
export const getVendorRoute = async (req, res) => {
  try {
    const fromLat = Number(req.body?.from?.lat);
    const fromLng = Number(req.body?.from?.lng);
    const toLat = Number(req.body?.to?.lat);
    const toLng = Number(req.body?.to?.lng);

    const finite = (v) => Number.isFinite(v);
    if (
      !finite(fromLat) || !finite(fromLng) ||
      Math.abs(fromLat) > 90 || Math.abs(fromLng) > 180 ||
      !finite(toLat) || !finite(toLng) ||
      Math.abs(toLat) > 90 || Math.abs(toLng) > 180
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid latitude and longitude are required",
      });
    }

    const coordinates = `${fromLng},${fromLat};${toLng},${toLat}`;

    // Path of least distance — try each instance so a throttled host never
    // causes routing to fail, then pick the shortest alternative.
    for (const base of OSRM_PROVIDERS) {
      try {
        const { data } = await axios.get(
          `${base}/${coordinates}?overview=full&geometries=geojson&alternatives=true`,
          { timeout: OSRM_TIMEOUT_MS }
        );
        const routes = data?.routes;
        if (!Array.isArray(routes) || routes.length === 0) continue;
        const best = routes.reduce((a, b) => (b.distance < a.distance ? b : a));
        const coords = best?.geometry?.coordinates;
        if (!best || !Array.isArray(coords) || coords.length < 2) continue;
        return res.json({
          success: true,
          data: {
            distance: best.distance,
            duration: best.duration,
            geometry: { coordinates: coords },
          },
        });
      } catch {
        // Throttled or failed — try the next instance.
      }
    }

    return res.status(502).json({
      success: false,
      message: "Routing is currently unavailable",
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to fetch route");
    res.status(500).json({ success: false, message: "Failed to fetch route" });
  }
};

// ---- payout / settlement destination ----

// GET — return the vendor's current payout details (masked account number)
export const getPayoutInfo = async (req, res) => {
  try {
    const v = req.account;
    res.json({
      success: true,
      data: {
        payoutMethod: v.payoutMethod || null,
        payoutAccountHolder: v.payoutAccountHolder || null,
        payoutBankName: v.payoutBankName || null,
        payoutAccountNumber: v.payoutAccountNumber
          ? maskAccountNumber(decryptField(v.payoutAccountNumber))
          : null,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to load payout info");
    res.status(500).json({ success: false, message: "Failed to load payout info" });
  }
};

// PATCH — create or update payout destination
export const updatePayoutInfo = async (req, res) => {
  try {
    const { payoutMethod, payoutAccountHolder, payoutBankName, payoutAccountNumber } = req.body;

    if (!payoutMethod || !["bank"].includes(payoutMethod)) {
      return res.status(400).json({
        success: false,
        message: "Valid payout method is required (bank)",
      });
    }

    if (!payoutAccountHolder || !payoutAccountHolder.trim()) {
      return res.status(400).json({
        success: false,
        message: "Account holder name is required",
      });
    }

    if (payoutMethod === "bank") {
      if (!payoutBankName || !payoutBankName.trim()) {
        return res.status(400).json({
          success: false,
          message: "Bank name is required",
        });
      }
      if (!payoutAccountNumber || !payoutAccountNumber.trim()) {
        return res.status(400).json({
          success: false,
          message: "Account number is required",
        });
      }
    }

    const v = req.account;
    v.payoutMethod = payoutMethod;
    v.payoutAccountHolder = payoutAccountHolder.trim();
    v.payoutBankName = payoutBankName.trim();
    v.payoutAccountNumber = encryptField(payoutAccountNumber.trim());

    await v.save();

    res.json({
      success: true,
      message: "Payout information updated",
      data: {
        payoutMethod: v.payoutMethod,
        payoutAccountHolder: v.payoutAccountHolder,
        payoutBankName: v.payoutBankName,
        payoutAccountNumber: v.payoutAccountNumber
          ? maskAccountNumber(decryptField(v.payoutAccountNumber))
          : null,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to update payout info");
    res.status(500).json({ success: false, message: "Failed to update payout info" });
  }
};

// great-circle distance between two [lng, lat] pairs, in km
const haversineKm = ([lng1, lat1], [lng2, lat2]) => {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// shape of an order as the vendor sees it
const presentOrder = (order, extra = {}) => ({
  id: order._id,
  code: "#" + String(order._id).slice(-6).toUpperCase(),
  customer: {
    name: order.user?.name || "Customer",
    phone: order.user?.phone || "",
    email: order.user?.email || "",
  },
  // delivery point picked by the customer on the map
  dropoff: order.dropoff?.coordinates
    ? {
        lat: order.dropoff.coordinates[1],
        lng: order.dropoff.coordinates[0],
        label: order.dropoff.label || "",
      }
    : null,
  items: (order.items || []).map((row) => ({
    nameEng: row.nameEng,
    nameNep: row.nameNep || "",
    unitEng: row.unitEng || "",
    unitNep: row.unitNep || "",
    quantity: row.quantity,
    priceAtOrder: row.priceAtOrder ?? row.avgPriceAtOrder,
  })),
  totalQuantity: order.totalQuantity,
  subtotal: order.subtotal,
  deliveryCharge: order.deliveryCharge,
  additionalCharges: order.additionalCharges,
  total: order.total,
  status: order.status,
  paymentStatus: order.paymentStatus,
  paymentMethod: order.paymentMethod,
  acceptedAt: order.acceptedAt,
  completedAt: order.completedAt,
  priorityStage: order.priorityStage,
  priorityExpiresAt: order.priorityExpiresAt,
  createdAt: order.createdAt,
  ...extra,
});

// ---- new requests: pending orders nobody has claimed yet ----
// Only shows orders for which THIS vendor is eligible based on
// the order's current priority stage and the distance between
// this vendor's location and the customer's drop-off.
//
// Priority stage visibility rules:
//   SEARCHING_0_5KM  → only vendors ≤ 0.5 km from dropoff
//   SEARCHING_1KM    → only vendors ≤ 1 km from dropoff
//   SEARCHING_CLOSEST → the single nearest vendor to the dropoff
//
// Stage-1 and stage-2 orders are batch-filtered in memory using the
// haversine distance already computed for display (no per-order DB query).
// Stage-3 orders each require a $geoNear to find the closest vendor.
export const listNewRequests = async (req, res) => {
  try {
    const myLoc = req.account.location?.coordinates;
    const vendorId = req.account._id;

    // 1. pending unclaimed orders that are either:
    //    - in their final stage (SEARCHING_CLOSEST, priorityExpiresAt: null)
    //    - in stage 1 or 2 with a future expiry (not yet expired)
    const now = new Date();
    const orders = await orderModel
      .find({
        status: "Pending",
        vendor: null,
        priorityStage: { $ne: "NO_VENDOR_AVAILABLE" },
        $or: [
          { priorityExpiresAt: null },
          { priorityExpiresAt: { $gt: now } },
        ],
      })
      .populate("user", "name email phone")
      .sort({ createdAt: -1 });

    if (orders.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // 2. bucket orders by priority stage
    const stageBuckets = { SEARCHING_0_5KM: [], SEARCHING_1KM: [], SEARCHING_CLOSEST: [] };
    for (const order of orders) {
      const stage = order.priorityStage || "SEARCHING_0_5KM";
      if (stageBuckets[stage]) {
        stageBuckets[stage].push(order);
      }
    }

    const eligibleOrderIds = new Set();
    const orderDistances = new Map();

    // 3. check stage-1 and stage-2 orders using in-memory haversine
    //    (the vendor's own location and hasSetLocation are already in
    //    scope from req.account — no DB round-trip needed).
    for (const stage of ["SEARCHING_0_5KM", "SEARCHING_1KM"]) {
      const bucket = stageBuckets[stage];
      if (bucket.length === 0 || !myLoc) continue;

      const maxKm = STAGE_RADIUS_KM[stage];
      for (const order of bucket) {
        const coords = order.dropoff?.coordinates;
        if (!coords) continue;

        if (req.account.hasSetLocation) {
          const dist = haversineKm(myLoc, coords);
          if (dist <= maxKm) {
            eligibleOrderIds.add(String(order._id));
            orderDistances.set(String(order._id), dist);
          }
        }
      }
    }

    // 4. batch-check stage-3 orders — find the closest vendor to each
    //    dropoff and flag this vendor when it is the one.
    //    dropoffClosest maps "lng,lat" → closest vendor id string
    const dropoffClosest = new Map();
    if (myLoc && stageBuckets.SEARCHING_CLOSEST.length > 0) {
      for (const order of stageBuckets.SEARCHING_CLOSEST) {
        const coords = order.dropoff?.coordinates;
        if (!coords) continue;
        const key = coords.join(",");

        if (!dropoffClosest.has(key)) {
          // Same eligibility filter as geoVendorMatcher's SEARCHING_CLOSEST
          // (nearest eligible vendor within DELIVERY_MAX_KM) — otherwise a
          // vendor that never set a real location (default
          // Kathmandu coords) or an unavailable vendor could be picked as
          // "closest" and the truly eligible vendor would never see the order.
          const nearestDocs = await vendorModel.aggregate([
            {
              $geoNear: {
                near: { type: "Point", coordinates: coords },
                distanceField: "dist",
                maxDistance: DELIVERY_MAX_KM * 1000,
                spherical: true,
                query: {
                  hasSetLocation: true,
                  "location.type": "Point",
                  "location.coordinates": { $exists: true, $ne: [] },
                  isAvailable: { $ne: false },
                },
              },
            },
            { $limit: 1 },
          ]);
          dropoffClosest.set(key, nearestDocs[0]?._id ? String(nearestDocs[0]._id) : null);
        }

        if (dropoffClosest.get(key) === String(vendorId)) {
          eligibleOrderIds.add(String(order._id));
        }
      }
    }

    // 5. filter and enrich
    const enriched = [];

    for (const order of orders) {
      if (!eligibleOrderIds.has(String(order._id))) continue;

      const extra = {};
      if (myLoc && order.dropoff?.coordinates) {
        const dist =
          orderDistances.get(String(order._id)) ?? haversineKm(myLoc, order.dropoff.coordinates);
        extra.distanceKm = Math.round(dist * 10) / 10;
      }

      // closest-vendor badge — reuse the result from step 4
      if (order.priorityStage === "SEARCHING_CLOSEST" && myLoc && order.dropoff?.coordinates) {
        const key = order.dropoff.coordinates.join(",");
        if (dropoffClosest.get(key) === String(vendorId)) {
          extra.isClosestVendor = true;
        }
      }

      enriched.push({ order, extra });
    }

    if (myLoc) {
      enriched.sort((a, b) => (a.extra.distanceKm ?? Number.MAX_VALUE) - (b.extra.distanceKm ?? Number.MAX_VALUE));
    }

    res.json({
      success: true,
      data: enriched.map(({ order, extra }) => presentOrder(order, extra)),
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to load new requests");
    res.status(500).json({ success: false, message: "Failed to load new requests" });
  }
};

// ---- accepted: claimed by this vendor and not yet completed ----
export const listAcceptedRequests = async (req, res) => {
  try {
    const orders = await orderModel
      .find({
        vendor: req.account._id,
        status: "Processing",
        paymentStatus: { $ne: "completed" }
      })
      .populate("user", "name email phone")
      .sort({ acceptedAt: -1 });

    res.json({ success: true, data: orders.map(presentOrder) });
  } catch (error) {
    logger.error({ err: error }, "Failed to load accepted requests");
    res.status(500).json({ success: false, message: "Failed to load accepted requests" });
  }
};

// ---- claim a pending request ----
// Security-critical: validates stage, expiry, geographic eligibility,
// and uses an atomic findOneAndUpdate with a stage guard so that two
// simultaneous accept requests cannot both succeed — only the first
// wins (optimistic concurrency).
//
// Client-supplied deliveryCharge, priorityStage, distance, and
// assignedVendor are NEVER read from the request body.
export const acceptRequest = async (req, res) => {
  try {
    const order = await orderModel.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // ── 1. stage validity ────────────────────────────────────────
    const stage = order.priorityStage;

    if (!["SEARCHING_0_5KM", "SEARCHING_1KM", "SEARCHING_CLOSEST"].includes(stage)) {
      return res.status(409).json({
        success: false,
        message: "This request is no longer available",
      });
    }

    // ── 2. stage-expiry check ────────────────────────────────────
    // Stages 1 and 2 have a 1-minute window.  If the scheduler has
    // not yet advanced the order but the window has elapsed, reject.
    if (stage !== "SEARCHING_CLOSEST") {
      if (!order.priorityExpiresAt || order.priorityExpiresAt <= new Date()) {
        return res.status(409).json({
          success: false,
          message: "This search stage has expired",
        });
      }
    }

    // ── 3. availability revalidation ─────────────────────────────
    // The vendor may have gone unavailable between discovery (when the
    // order appeared in their new-requests list) and this acceptance.
    // Acceptance must not trust an earlier search result — it rechecks
    // the vendor's current availability.  `req.account` is the live
    // document loaded by the auth middleware on this request.
    if (req.account.isAvailable === false) {
      return res.status(409).json({
        success: false,
        message: "Your shop is currently unavailable to accept orders",
      });
    }

    // ── 4. geographic eligibility ────────────────────────────────
    // Verify the accepting vendor is actually within the permitted
    // radius for the current stage.  A malicious vendor calling the
    // endpoint directly must not be able to claim an order outside
    // their geographic range.  SEARCHING_CLOSEST is bounded by the
    // service-area cap (DELIVERY_MAX_KM) instead of a per-stage radius.
    const vendorCoords = req.account.location?.coordinates;
    const dropoffCoords = order.dropoff?.coordinates;

    if (!vendorCoords || !dropoffCoords) {
      return res.status(403).json({
        success: false,
        message: "Location required to accept orders",
      });
    }

    const distKm = haversineKm(vendorCoords, dropoffCoords);
    const requiredRadius = STAGE_RADIUS_KM[stage] ?? DELIVERY_MAX_KM;

    if (distKm > requiredRadius) {
      return res.status(403).json({
        success: false,
        message: "You are outside the delivery radius for this stage",
      });
    }

    // ── 5. atomic claim ──────────────────────────────────────────
    // assignVendor uses findOneAndUpdate with { vendor: null,
    // priorityStage: { $in: [...] } } guard.  If another vendor
    // already accepted, this returns null.  The delivery charge is
    // derived from `distKm` (distance-based tariff).
    const updated = await assignVendor(order._id, req.account._id, distKm);

    if (!updated) {
      return res.status(409).json({
        success: false,
        message: "This request has already been taken",
      });
    }

    // unhide items from this order so they appear in Items Needed list
    const vendor = await vendorModel.findById(req.account._id);
    if (vendor && vendor.hiddenItems?.length) {
      const orderItemNames = (updated.items || []).map((row) => row.nameEng);
      const newHidden = vendor.hiddenItems.filter((name) => !orderItemNames.includes(name));
      if (newHidden.length !== vendor.hiddenItems.length) {
        vendor.hiddenItems = newHidden;
        await vendor.save();
      }
    }

    await updated.populate("user", "name email phone");

    res.json({
      success: true,
      message: "Request accepted",
      data: presentOrder(updated),
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to accept request");
    res.status(500).json({ success: false, message: "Failed to accept request" });
  }
};

// ---- mark an accepted order as completed ----
// Uses an atomic findOneAndUpdate with vendor + status + payment guards
// so concurrent or duplicate completions cannot produce invalid state.
// Payment must be in a verified state (paid or cash_recorded/completed)
// before delivery can be marked complete.
export const completeRequest = async (req, res) => {
  try {
    const updated = await orderModel.findOneAndUpdate(
      {
        _id: req.params.id,
        vendor: req.account._id,
        status: "Processing",
        paymentStatus: { $in: ["paid", "completed"] },
      },
      {
        $set: {
          status: "Delivered",
          completedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    ).populate("user", "name email phone");

    if (!updated) {
      // Distinguish between not-found and invalid-state by checking existence
      const order = await orderModel.findById(req.params.id);

      if (!order) {
        return res.status(404).json({ success: false, message: "Order not found" });
      }
      if (String(order.vendor) !== String(req.account._id)) {
        return res.status(403).json({
          success: false,
          message: "This order is not assigned to you",
        });
      }
      if (order.status === "Delivered") {
        return res.status(409).json({
          success: false,
          message: "Order already completed",
        });
      }
      if (order.status !== "Processing") {
        return res.status(409).json({
          success: false,
          message: "Only accepted orders can be completed",
        });
      }
      if (!["paid", "completed"].includes(order.paymentStatus)) {
        return res.status(409).json({
          success: false,
          message: "Payment must be confirmed before completing delivery",
        });
      }
      return res.status(409).json({
        success: false,
        message: "Order cannot be completed",
      });
    }

    res.json({ success: true, message: "Order completed", data: presentOrder(updated) });
  } catch (error) {
    logger.error({ err: error }, "Failed to complete order");
    res.status(500).json({ success: false, message: "Failed to complete order" });
  }
};

// ---- yellow view: everything this vendor still needs to deliver ----
// aggregates item quantities over THIS vendor's accepted (in-progress)
// orders and prices them at the max price snapshot carried per line
export const itemsSummary = async (req, res) => {
  try {
    const orders = await orderModel.find({
      vendor: req.account._id,
      status: "Processing",
      paymentStatus: { $ne: "completed" },
    });

    const byItem = new Map();

    for (const order of orders) {
      for (const row of order.items || []) {
        const key = row.nameEng;
        const price = row.priceAtOrder ?? row.avgPriceAtOrder ?? 0;

        if (!byItem.has(key)) {
          byItem.set(key, {
            nameEng: key,
            nameNep: row.nameNep || "",
            unitEng: row.unitEng || "",
            unitNep: row.unitNep || "",
            quantity: 0,
            pricePerKg: price,
          });
        }

        const entry = byItem.get(key);
        entry.quantity += row.quantity;
        // keep the freshest known max price for the item
        if (price > 0) entry.pricePerKg = price;
      }
    }

    const data = [...byItem.values()]
      .filter((entry) => !(req.account.hiddenItems || []).includes(entry.nameEng))
      .map((entry) => ({
        ...entry,
        quantity: Math.round(entry.quantity * 100) / 100,
        lineTotal: Math.round(entry.quantity * entry.pricePerKg * 100) / 100,
      }))
      .sort((a, b) => a.nameEng.localeCompare(b.nameEng));

    const grandTotal =
      Math.round(data.reduce((sum, row) => sum + row.lineTotal, 0) * 100) / 100;

    res.json({ success: true, data, grandTotal });
  } catch (error) {
    logger.error({ err: error }, "Failed to build summary");
    res.status(500).json({ success: false, message: "Failed to build summary" });
  }
};

// ---- ADMIN — list all vendors with full details ----
export const listVendors = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [vendors, total] = await Promise.all([
      vendorModel.find({}, { password: 0 }).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      vendorModel.countDocuments(),
    ]);

    const data = vendors.map((v) => ({
      id: v._id,
      name: v.name,
      email: v.email,
      phone: v.phone,
      hasSetLocation: v.hasSetLocation,
      location: v.location?.coordinates
        ? { lat: v.location.coordinates[1], lng: v.location.coordinates[0] }
        : null,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    }));

    res.json({
      success: true,
      data,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to fetch vendors");
    res.status(500).json({ success: false, message: "Failed to fetch vendors" });
  }
};

// ---- completed: orders with completed payments for this vendor ----
export const listCompletedRequests = async (req, res) => {
  try {
    const orders = await orderModel
      .find({
        vendor: req.account._id,
        paymentStatus: "completed",
      })
      .populate("user", "name email phone")
      .sort({ updatedAt: -1 });

    res.json({ success: true, data: orders.map(presentOrder) });
  } catch (error) {
    logger.error({ err: error }, "Failed to load completed orders");
    res.status(500).json({ success: false, message: "Failed to load completed orders" });
  }
};

// ---- hide items from items needed list ---------------------------
export const hideItems = async (req, res) => {
  try {
    const { itemNames } = req.body;

    if (!Array.isArray(itemNames)) {
      return res.status(400).json({ success: false, message: "itemNames must be an array" });
    }

    const vendor = await vendorModel.findById(req.account._id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: "Vendor not found" });
    }

    // Add new items to hiddenItems (avoid duplicates)
    const hiddenSet = new Set([...(vendor.hiddenItems || []), ...itemNames]);
    vendor.hiddenItems = [...hiddenSet];
    await vendor.save();

    res.json({ success: true, message: "Items hidden successfully" });
  } catch (error) {
    logger.error({ err: error }, "Failed to hide items");
    res.status(500).json({ success: false, message: "Failed to hide items" });
  }
};

// ---- unhide items (restore them to items needed list) ------------
export const unhideItems = async (req, res) => {
  try {
    const { itemNames } = req.body;

    if (!Array.isArray(itemNames)) {
      return res.status(400).json({ success: false, message: "itemNames must be an array" });
    }

    const vendor = await vendorModel.findById(req.account._id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: "Vendor not found" });
    }

    // Remove items from hiddenItems
    const hiddenSet = new Set(vendor.hiddenItems || []);
    itemNames.forEach(name => hiddenSet.delete(name));
    vendor.hiddenItems = [...hiddenSet];
    await vendor.save();

    res.json({ success: true, message: "Items restored successfully" });
  } catch (error) {
    logger.error({ err: error }, "Failed to restore items");
    res.status(500).json({ success: false, message: "Failed to restore items" });
  }
};
