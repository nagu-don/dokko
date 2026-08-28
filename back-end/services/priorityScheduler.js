import mongoose from "mongoose";
import orderModel from "../models/orderModel.js";
import { advanceStage } from "./priorityService.js";
import { PRIORITY_CONFIG } from "../config/priorityConfig.js";

// ── configuration ───────────────────────────────────────────────
const POLL_INTERVAL_MS = PRIORITY_CONFIG.SCHEDULER_POLL_INTERVAL_MS;
const STUCK_THRESHOLD_MS = PRIORITY_CONFIG.SCHEDULER_STUCK_THRESHOLD_MS;

// ── active timer handle ─────────────────────────────────────────
let timerId = null;

// ── core tick ───────────────────────────────────────────────────
// Finds every unassigned order whose stage has expired and advances
// it to the next stage.
//
// The query is intentionally defensive:
//   - $or ensures we catch both "normal" expiry (expiresAt < now)
//     and "stuck" orders (no expiresAt but startedAt is old)
//   - vendor: null prevents orders that already have a vendor from
//     being picked up (vendor accepted between ticks)
//   - priorityStage: $in ["SEARCHING_0_5KM", "SEARCHING_1KM"]
//     means SEARCHING_CLOSEST is excluded — it has no expiry and
//     no next stage
//
// Idempotency is guaranteed by the advanceStage function, which uses
// a findOneAndUpdate with a priorityStage guard.  If another tick
// or a concurrent acceptRequest already moved the order, the update
// is a no-op.
const tick = async () => {
  try {
    const now = new Date();

    const stuckOrders = await orderModel.find({
      vendor: null,
      priorityStage: { $in: ["SEARCHING_0_5KM", "SEARCHING_1KM"] },
      $or: [
        { priorityExpiresAt: { $lte: now, $ne: null } },
        {
          priorityExpiresAt: null,
          priorityStartedAt: { $lte: new Date(now.getTime() - STUCK_THRESHOLD_MS) },
        },
      ],
    });

    for (const order of stuckOrders) {
      try {
        await advanceStage(order);
      } catch {
        // individual order failure should not abort the batch
      }
    }
  } catch {
    // scheduler-level error — swallow and continue
  }
};

// ── wait for mongoose connection ────────────────────────────────
// server.js fires connectDB() without await, so the scheduler may
// start before the connection is ready.  We wait for the connection
// before running the first tick, then let the interval handle
// subsequent ticks.
const waitForConnection = () =>
  new Promise((resolve) => {
    if (mongoose.connection.readyState === 1) return resolve();
    mongoose.connection.once("connected", resolve);
  });

// ── public API ──────────────────────────────────────────────────
// Starts the polling loop.  Safe to call multiple times — a second
// call is a no-op if the timer is already running.
export const startScheduler = async () => {
  if (timerId) return;

  await waitForConnection();

  await tick();
  timerId = setInterval(tick, POLL_INTERVAL_MS);

  console.log(`[priority-scheduler] started (poll every ${POLL_INTERVAL_MS / 1000}s)`);
};

// Stops the polling loop gracefully.
export const stopScheduler = () => {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
    console.log("[priority-scheduler] stopped");
  }
};
