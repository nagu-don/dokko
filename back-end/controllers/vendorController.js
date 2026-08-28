import orderModel from "../models/orderModel.js";
import vendorModel from "../models/vendorModel.js";
import buildAuthController from "./authFactory.js";
import buildGoogleAuthController from "./googleAuthFactory.js";
import { authAdmin } from "../middleware/authMiddleware.js";
import { assignVendor } from "../services/priorityService.js";
import { STAGE_RADIUS_KM, STAGE_RADIUS_RADIANS } from "../config/priorityConfig.js";

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
          ? "XXXXXXXX" + v.payoutAccountNumber.slice(-4)
          : null,
      },
    });
  } catch (error) {
    console.error(error);
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
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to update location" });
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
          ? "XXXXXXXX" + v.payoutAccountNumber.slice(-4)
          : null,
      },
    });
  } catch (error) {
    console.error(error);
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
    v.payoutAccountNumber = payoutAccountNumber.trim();

    await v.save();

    res.json({
      success: true,
      message: "Payout information updated",
      data: {
        payoutMethod: v.payoutMethod,
        payoutAccountHolder: v.payoutAccountHolder,
        payoutBankName: v.payoutBankName,
        payoutAccountNumber: v.payoutAccountNumber
          ? "XXXXXXXX" + v.payoutAccountNumber.slice(-4)
          : null,
      },
    });
  } catch (error) {
    console.error(error);
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
// Stage-1 and stage-2 orders are batch-filtered using $geoWithin
// to avoid a separate DB query per order.
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

    // 3. batch-check stage-1 and stage-2 orders using $geoWithin
    //    $geoWithin with $centerSphere uses radians — same conversion
    //    as the geo matcher service.
    const STAGE_RADIUS = STAGE_RADIUS_RADIANS;

    for (const stage of ["SEARCHING_0_5KM", "SEARCHING_1KM"]) {
      const bucket = stageBuckets[stage];
      if (bucket.length === 0 || !myLoc) continue;

      for (const order of bucket) {
        const coords = order.dropoff?.coordinates;
        if (!coords) continue;

        const count = await vendorModel.countDocuments({
          _id: vendorId,
          hasSetLocation: true,
          "location.coordinates": {
            $geoWithin: {
              $centerSphere: [coords, STAGE_RADIUS[stage]],
            },
          },
        });

        if (count > 0) {
          eligibleOrderIds.add(String(order._id));
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
          const nearestDocs = await vendorModel.aggregate([
            {
              $geoNear: {
                near: { type: "Point", coordinates: coords },
                distanceField: "dist",
                spherical: true,
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
        const dist = haversineKm(myLoc, order.dropoff.coordinates);
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
    console.error(error);
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
    console.error(error);
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
    // their geographic range.
    const vendorCoords = req.account.location?.coordinates;
    const dropoffCoords = order.dropoff?.coordinates;

    if (!vendorCoords || !dropoffCoords) {
      return res.status(403).json({
        success: false,
        message: "Location required to accept orders",
      });
    }

    const requiredRadius = STAGE_RADIUS_KM[stage];

    if (requiredRadius) {
      const distKm = haversineKm(vendorCoords, dropoffCoords);
      if (distKm > requiredRadius) {
        return res.status(403).json({
          success: false,
          message: "You are outside the delivery radius for this stage",
        });
      }
    }

    // ── 5. atomic claim ──────────────────────────────────────────
    // assignVendor uses findOneAndUpdate with { vendor: null,
    // priorityStage: { $in: [...] } } guard.  If another vendor
    // already accepted, this returns null.
    const updated = await assignVendor(order._id, req.account._id, stage);

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
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to accept request" });
  }
};

// ---- mark an accepted order as completed ----
export const completeRequest = async (req, res) => {
  try {
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
    if (order.status !== "Processing") {
      return res.status(409).json({
        success: false,
        message: "Only accepted orders can be completed",
      });
    }

    order.status = "Delivered";
    order.completedAt = new Date();
    await order.save();

    res.json({ success: true, message: "Order completed", data: presentOrder(order) });
  } catch (error) {
    console.error(error);
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
          byItem.set(key, { nameEng: key, nameNep: row.nameNep || "", quantity: 0, pricePerKg: price });
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
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to build summary" });
  }
};

// ---- ADMIN — list all vendors with full details ----
export const listVendors = async (req, res) => {
  try {
    const vendors = await vendorModel
      .find({}, { password: 0 })
      .sort({ createdAt: -1 });

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

    res.json({ success: true, data });
  } catch (error) {
    console.error(error);
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
    console.error(error);
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
    console.error(error);
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
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to restore items" });
  }
};
