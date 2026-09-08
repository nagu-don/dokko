import orderModel from "../models/orderModel.js";
import { findEligibleVendors, nextStage } from "./geoVendorMatcher.js";
import { deliveryChargeForKm, STAGE_DURATION_MS } from "../config/priorityConfig.js";

const SEARCHING_STAGES = ["SEARCHING_0_5KM", "SEARCHING_1KM", "SEARCHING_CLOSEST"];

const round2 = (n) => Math.round(n * 100) / 100;

// ── initiate priority search ────────────────────────────────────
// Called once after order creation.  Fields are already set correctly
// by the order controller; this is a safety net that ensures the
// timestamps are always populated even if the controller is bypassed
// (e.g. a direct DB insert or a future admin-create flow).
//
// Idempotent — calling it on an already-initialised order is a no-op.
export const initiatePrioritySearch = async (orderId) => {
  const order = await orderModel.findById(orderId);
  if (!order) return null;
  if (order.priorityStartedAt) return order;

  const now = new Date();
  return orderModel.findByIdAndUpdate(
    orderId,
    {
      $set: {
        priorityStage: "SEARCHING_0_5KM",
        priorityStartedAt: now,
        priorityExpiresAt: new Date(now.getTime() + STAGE_DURATION_MS),
      },
    },
    { returnDocument: "after" }
  );
};

// ── advance one order to its next priority stage ────────────────
// Core of the escalation engine.  Advances a single order from its
// current stage to the next, running the geo matcher to decide
// whether the new stage has eligible vendors.
//
// Returns the updated order document.
//
// Idempotent — if the order's priorityStage has already changed
// since we read it, the findOneAndUpdate fails and returns null.
//
// Empty-stage optimisation:
//   If the new stage has zero eligible vendors and it is not the
//   final stage, we skip it immediately (loop) instead of waiting
//   the full one-minute window.
export const advanceStage = async (order) => {
  const currentStage = order.priorityStage;
  let targetStage = nextStage(currentStage);

  if (!targetStage) return order;

  const dropoff = order.dropoff?.coordinates;

  while (targetStage) {
    let vendors = [];
    if (dropoff) {
      const result = await findEligibleVendors(targetStage, dropoff);
      vendors = result.vendors;
    }

    // SEARCHING_CLOSEST is the final searching stage.  If no eligible
    // vendor exists, move to NO_VENDOR_AVAILABLE instead of leaving the
    // order permanently stuck at SEARCHING_CLOSEST.
    if (vendors.length === 0 && targetStage === "SEARCHING_CLOSEST") {
      targetStage = "NO_VENDOR_AVAILABLE";
    }

    if (vendors.length === 0 && targetStage !== "SEARCHING_CLOSEST" && targetStage !== "NO_VENDOR_AVAILABLE") {
      targetStage = nextStage(targetStage);
      continue;
    }

    const now = new Date();
    const update = {
      $set: {
        priorityStage: targetStage,
        priorityStartedAt: now,
      },
    };

    // SEARCHING_CLOSEST is the FINAL searching stage: it has no window and
    // is never advanced again by the scheduler (see priorityScheduler.js),
    // so it must NOT carry a priorityExpiresAt. If it did, listNewRequests
    // (`priorityExpiresAt: null` OR `> now`) would hide the order forever
    // once that window elapsed, even though the closest vendor is still
    // waiting to accept. Only stages 1/2 get a bounded 60s window.
    const isFinalStage = targetStage === "SEARCHING_CLOSEST";

    if (vendors.length > 0 && !isFinalStage) {
      update.$set.priorityExpiresAt = new Date(now.getTime() + STAGE_DURATION_MS);
    } else {
      update.$set.priorityExpiresAt = null;
    }

    const updated = await orderModel.findOneAndUpdate(
      {
        _id: order._id,
        priorityStage: currentStage,
      },
      update,
      { returnDocument: "after" }
    );

    return updated || order;
  }

  return order;
};

// ── assign a vendor to an order ─────────────────────────────────
// Called when a vendor accepts.  Atomically claims the order and
// sets the delivery charge for the distance between the vendor and
// the customer's drop-off (banded tariff, see priorityConfig.js).
// Acceptances beyond DELIVERY_MAX_KM are refused (charge null).
//
// Uses a findOneAndUpdate with a stage guard so that two
// simultaneous accept requests cannot both succeed — only the
// first wins (optimistic concurrency).
//
// @param {string}  orderId
// @param {string}  vendorId
// @param {number}  distanceKm  — distance from the vendor to the drop-off
// @returns {Promise<Object|null>} — the updated order, or null if already taken
export const assignVendor = async (orderId, vendorId, distanceKm) => {
  const deliveryCharge = deliveryChargeForKm(distanceKm);
  if (deliveryCharge === null) return null;

  const updated = await orderModel.findOneAndUpdate(
    {
      _id: orderId,
      vendor: null,
      priorityStage: { $in: SEARCHING_STAGES },
    },
    {
      $set: {
        vendor: vendorId,
        status: "Processing",
        acceptedAt: new Date(),
        deliveryCharge,
        priorityStage: "ASSIGNED",
        priorityExpiresAt: null,
      },
    },
    { returnDocument: "after" }
  );

  if (!updated) return null;

  const total = round2(updated.subtotal + deliveryCharge + updated.additionalCharges);

  return orderModel.findByIdAndUpdate(
    orderId,
    { $set: { total } },
    { returnDocument: "after" }
  );
};
