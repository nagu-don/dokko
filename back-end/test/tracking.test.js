/**
 * Live order-tracking tests — run with:
 *   node --env-file-if-exists=.env test/tracking.test.js
 *
 * Tests two endpoints:
 *   PATCH /api/vendors/live-location      (vendor reports GPS while delivering)
 *   GET  /api/orders/:orderId/vendor-location  (customer reads assigned vendor)
 *
 * Covers:
 *  1. Vendor can update live location while an order is Processing
 *  2. Wrong / unauthorised vendor → 401/403
 *  3. Invalid / out-of-range coordinates → 400
 *  4. No active (Processing) order → 409
 *  5. Post-completion (Delivered) → tracking stops (vendor 409, customer none)
 *  6. Customer can read the assigned vendor's live location while Processing
 *  7. Wrong / unauthorised customer → 403 / 401
 *  8. Customer tracking before assignment (Pending, no vendor) → tracking:false
 *  9. Customer tracking after terminal state → tracking:false, no location
 * 10. Rate guard (too-fast duplicate) → 429, only first write persists
 * 11. updatedAt is a valid recent server timestamp
 * 12. Static `location` is never returned by the tracking read
 */

import "dotenv/config";
import dns from "node:dns";
import mongoose from "mongoose";
import express from "express";
import jwt from "jsonwebtoken";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

import orderModel from "../models/orderModel.js";
import vendorModel from "../models/vendorModel.js";
import userModel from "../models/userModel.js";
import vendorRouter from "../routes/vendorRouter.js";
import orderRouter from "../routes/orderRouter.js";

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("MONGO_URI not set — cannot run tracking tests");
  process.exit(1);
}

let passed = 0;
let failed = 0;
const assert = (condition, label) => {
  if (condition) {
    console.log(`  \u2713 ${label}`);
    passed++;
  } else {
    console.error(`  \u2717 ${label}`);
    failed++;
  }
};

const app = express();
app.use(express.json());
app.use("/api/vendors", vendorRouter);
app.use("/api/orders", orderRouter);

let server;
let baseURL;
const testPrefix = `_test_track_${Date.now()}`;

const api = async (method, path, body, token) => {
  const url = `${baseURL}${path}`;
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const useBody = !["GET", "HEAD"].includes(method) && body !== undefined;
  const res = await fetch(url, {
    method,
    headers,
    body: useBody ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
};

import { connectTestDB, disconnectTestDB } from "./helpers/testDb.js";

await connectTestDB();
server = app.listen(0);
baseURL = `http://127.0.0.1:${server.address().port}`;
const db = mongoose.connection.db;

await db.collection("vendors").deleteMany({ email: { $regex: `^${testPrefix}` } });
await db.collection("users").deleteMany({ email: { $regex: `^${testPrefix}` } });
await db.collection("orders").deleteMany({ user: { $exists: true }, vendor: { $exists: true } });

const bcrypt = (await import("bcrypt")).default;
const salt = await bcrypt.genSalt(10);
const hashedPassword = await bcrypt.hash("test123456", salt);

const makeVendor = async (emailSuffix) =>
  vendorModel.create({
    name: `Track Vendor ${emailSuffix}`,
    email: `${testPrefix}-${emailSuffix}@test.com`,
    phone: String(Date.now() + Math.floor(Math.random() * 10000)).slice(-10),
    password: hashedPassword,
    hasSetLocation: true,
    location: { type: "Point", coordinates: [85.32, 27.71] },
  });

const testVendor = await makeVendor("main");
const otherVendor = await makeVendor("other");
const idleVendor = await makeVendor("idle");

const vendorToken = jwt.sign({ id: testVendor._id }, process.env.JWT_SECRET, { expiresIn: "1d" });
const otherVendorToken = jwt.sign({ id: otherVendor._id }, process.env.JWT_SECRET, { expiresIn: "1d" });
const idleToken = jwt.sign({ id: idleVendor._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

const testCustomer = await userModel.create({
  name: "Track Customer",
  email: `${testPrefix}-customer@test.com`,
  phone: String(Date.now() + 9999).slice(-10),
  password: hashedPassword,
});
const otherCustomer = await userModel.create({
  name: "Other Customer",
  email: `${testPrefix}-customer2@test.com`,
  phone: String(Date.now() + 8888).slice(-10),
  password: hashedPassword,
});

const customerToken = jwt.sign({ id: testCustomer._id }, process.env.JWT_SECRET, { expiresIn: "1d" });
const otherCustomerToken = jwt.sign({ id: otherCustomer._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

const makeOrder = async (overrides = {}) =>
  orderModel.create({
    user: testCustomer._id,
    items: [{ nameEng: "Tomato", nameNep: "गोलभेंडा", quantity: 2, priceAtOrder: 80 }],
    totalQuantity: 2,
    subtotal: 160,
    deliveryCharge: 50,
    additionalCharges: 15,
    total: 225,
    status: "Processing",
    vendor: testVendor._id,
    acceptedAt: new Date(),
    paymentStatus: "paid",
    ...overrides,
  });

console.log("\nA. Vendor live-location update");

// 1. valid update while Processing
console.log("\nA1. Valid update while an order is Processing");
const vGood = await makeOrder();
const up1 = await api("PATCH", "/api/vendors/live-location", { lat: 27.71, lng: 85.33 }, vendorToken);
assert(up1.status === 200, "Valid update returns 200");
assert(up1.data.success === true, "Returns success=true");
assert(up1.data.data.lat === 27.71 && up1.data.data.lng === 85.33, "Response echoes lat/lng");

// 11. updatedAt is a valid recent server timestamp
const up1ts = new Date(up1.data.data.updatedAt).getTime();
assert(Number.isFinite(up1ts) && Math.abs(Date.now() - up1ts) < 15000, "updatedAt is a fresh server timestamp");
const dbVendorLive = await vendorModel.findById(testVendor._id);
const coords = dbVendorLive.liveLocation?.coordinates;
assert(Array.isArray(coords) && coords[0] === 85.33 && coords[1] === 27.71, "liveLocation stored as [lng, lat]");
assert(dbVendorLive.liveLocation.updatedAt instanceof Date, "liveLocation.updatedAt stored as Date");
assert(dbVendorLive.location.coordinates[0] === 85.32, "Static location NOT overwritten by live update");

// 2. unauthenticated vendor (the PATCH is self-only via req.account, so the
//    meaningful wrong-actor checks are: no/bad token → 401/403, and an
//    authenticated vendor with no active delivery → 409)
console.log("\nA2. Unauthorised vendor");
const up2b = await api("PATCH", "/api/vendors/live-location", { lat: 27.71, lng: 85.33 }, undefined);
assert(up2b.status === 401 || up2b.status === 403, "No token denied (401/403)");
const badToken = jwt.sign({ id: new mongoose.Types.ObjectId() }, "wrong-secret");
const up2c = await api("PATCH", "/api/vendors/live-location", { lat: 27.71, lng: 85.33 }, badToken);
assert(up2c.status === 401 || up2c.status === 403, "Invalid token denied (401/403)");
// otherVendor is authenticated and valid but has no active delivery → lifecycle 409
const up2a = await api("PATCH", "/api/vendors/live-location", { lat: 27.71, lng: 85.33 }, otherVendorToken);
assert(up2a.status === 409, "Authenticated vendor with no active delivery denied (409)");

// 3. invalid / out-of-range coordinates
console.log("\nA3. Invalid coordinates");
const vInvalid = await makeOrder();
const up3a = await api("PATCH", "/api/vendors/live-location", { lat: 91, lng: 85.33 }, vendorToken);
assert(up3a.status === 400, "lat > 90 returns 400");
const up3b = await api("PATCH", "/api/vendors/live-location", { lat: 27.71, lng: 181 }, vendorToken);
assert(up3b.status === 400, "lng > 180 returns 400");
const up3c = await api("PATCH", "/api/vendors/live-location", { lat: "abc", lng: 85.33 }, vendorToken);
assert(up3c.status === 400, "non-numeric lat returns 400");
const up3d = await api("PATCH", "/api/vendors/live-location", {}, vendorToken);
assert(up3d.status === 400, "missing coords returns 400");

// 4. no active (Processing) order
console.log("\nA4. No active order to track");
const up4 = await api("PATCH", "/api/vendors/live-location", { lat: 27.71, lng: 85.33 }, idleToken);
assert(up4.status === 409, "Vendor with no Processing order returns 409");

// 5. post-completion: vendor can no longer update
// Uses a dedicated vendor whose ONLY order gets delivered → after that the
// vendor has no active (Processing) delivery and tracking must stop.
console.log("\nA5. Post-completion stops vendor updates");
const soloVendor = await makeVendor("solo");
const soloToken = jwt.sign({ id: soloVendor._id }, process.env.JWT_SECRET, { expiresIn: "1d" });
const vSolo = await orderModel.create({
  user: testCustomer._id,
  items: [{ nameEng: "Tomato", nameNep: "गोलभेंडा", quantity: 1, priceAtOrder: 80 }],
  totalQuantity: 1,
  subtotal: 80,
  deliveryCharge: 50,
  additionalCharges: 15,
  total: 145,
  status: "Processing",
  vendor: soloVendor._id,
  acceptedAt: new Date(),
  paymentStatus: "paid",
});
const up5a = await api("PATCH", "/api/vendors/live-location", { lat: 27.71, lng: 85.33 }, soloToken);
assert(up5a.status === 200, "Solo vendor can update while delivering");
await orderModel.findByIdAndUpdate(vSolo._id, { status: "Delivered", completedAt: new Date() });
await new Promise((r) => setTimeout(r, 2100)); // wait out rate window so the rejection is lifecycle-based
const up5 = await api("PATCH", "/api/vendors/live-location", { lat: 27.71, lng: 85.34 }, soloToken);
assert(up5.status === 409, "Vendor update after Delivered returns 409");

// 10. rate guard
console.log("\nA10. Rate guard (too-frequent duplicate)");
const vRate = await makeOrder();
await new Promise((r) => setTimeout(r, 2100)); // ensure window clear
const r1 = await api("PATCH", "/api/vendors/live-location", { lat: 27.70, lng: 85.32 }, vendorToken);
const r2 = await api("PATCH", "/api/vendors/live-location", { lat: 27.71, lng: 85.33 }, vendorToken);
assert(r1.status === 200, "First update succeeds");
assert(r2.status === 429, "Second immediate update rejected (429)");
const dbVendorRate = await vendorModel.findById(testVendor._id);
assert(dbVendorRate.liveLocation.coordinates[0] === 85.32, "Only the first write persisted");

console.log("\nB. Customer vendor-location read");

// 6. valid read while Processing (fresh live location)
console.log("\nB6. Customer reads assigned vendor location while Processing");
await new Promise((r) => setTimeout(r, 2100)); // clear rate window
await api("PATCH", "/api/vendors/live-location", { lat: 27.72, lng: 85.35 }, vendorToken);
const rd1 = await api("GET", `/api/orders/${vGood._id}/vendor-location`, {}, customerToken);
assert(rd1.status === 200, "Valid read returns 200");
assert(rd1.data.data.tracking === true, "tracking=true while Processing");
assert(rd1.data.data.location !== null, "location returned");
assert(rd1.data.data.location.lng === 85.35 && rd1.data.data.location.lat === 27.72, "location lat/lng correct");
assert(rd1.data.data.vendor && rd1.data.data.vendor.id === String(testVendor._id), "vendor id derived server-side");
assert(rd1.data.data.location.lastUpdatedAt !== null, "lastUpdatedAt present");

// 7. wrong / unauthorised customer
console.log("\nB7. Wrong / unauthorised customer");
const rd7a = await api("GET", `/api/orders/${vGood._id}/vendor-location`, {}, otherCustomerToken);
assert(rd7a.status === 403, "Other customer read denied (403)");
const rd7b = await api("GET", `/api/orders/${vGood._id}/vendor-location`, {}, undefined);
assert(rd7b.status === 401 || rd7b.status === 403, "No token read denied (401/403)");
const missing = new mongoose.Types.ObjectId();
const rd7c = await api("GET", `/api/orders/${missing}/vendor-location`, {}, customerToken);
assert(rd7c.status === 404, "Non-existent order returns 404");

// 8. tracking before assignment (Pending, no vendor)
console.log("\nB8. Tracking before assignment");
const bPending = await makeOrder({ status: "Pending", vendor: null, acceptedAt: null });
const rd8 = await api("GET", `/api/orders/${bPending._id}/vendor-location`, {}, customerToken);
assert(rd8.status === 200, "Read returns 200 for Pending order");
assert(rd8.data.data.tracking === false, "tracking=false while Pending");
assert(rd8.data.data.location === null, "No location returned before assignment");

// 9. tracking after terminal state
console.log("\nB9. Tracking after terminal state");
const bTerminal = await makeOrder({ status: "Cancelled" });
const rd9a = await api("GET", `/api/orders/${bTerminal._id}/vendor-location`, {}, customerToken);
assert(rd9a.status === 200, "Read returns 200 for Cancelled order");
assert(rd9a.data.data.tracking === false, "tracking=false after Cancelled");
assert(rd9a.data.data.location === null, "No location returned after terminal state");

const bDelivered = await makeOrder({ status: "Delivered", completedAt: new Date() });
const rd9b = await api("GET", `/api/orders/${bDelivered._id}/vendor-location`, {}, customerToken);
assert(rd9b.data.data.tracking === false, "tracking=false after Delivered");
assert(rd9b.data.data.location === null, "No location returned after Delivered");

// 12. static location is never returned as live
console.log("\nB12. Static location is never returned as live");
const bLive = await makeOrder();
await new Promise((r) => setTimeout(r, 2100));
await api("PATCH", "/api/vendors/live-location", { lat: 27.73, lng: 85.38 }, vendorToken);
const rd12 = await api("GET", `/api/orders/${bLive._id}/vendor-location`, {}, customerToken);
assert(rd12.data.data.tracking === true, "tracking=true");
assert(rd12.data.data.location.lng === 85.38, "Returned lng matches liveLocation (85.38), NOT static 85.32");
assert(rd12.data.data.location.lat === 27.73, "Returned lat matches liveLocation (27.73), NOT static 27.71");

console.log("\nCleaning up test data...");
await db.collection("vendors").deleteMany({
  _id: { $in: [testVendor._id, otherVendor._id, idleVendor._id, soloVendor._id] },
});
await db.collection("users").deleteMany({ _id: { $in: [testCustomer._id, otherCustomer._id] } });
await db.collection("orders").deleteMany({ user: { $in: [testCustomer._id, otherCustomer._id] } });
console.log("Cleanup done");

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"=".repeat(50)}`);

server.close();
await disconnectTestDB();
process.exit(failed > 0 ? 1 : 0);
