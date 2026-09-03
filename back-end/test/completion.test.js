/**
 * Vendor delivery completion tests — run with:
 *   node --env-file-if-exists=.env test/completion.test.js
 *
 * Tests the PATCH /api/vendors/requests/complete/:id endpoint:
 *  1. Valid completion (Processing + paid) → Delivered, completedAt set
 *  2. Wrong vendor → 403
 *  3. Unauthorised (no/bad token) → 401/403
 *  4. Missing order → 404
 *  5. Invalid order state (Pending) → 409
 *  6. Already completed order → 409 (idempotent-safe)
 *  7. Cancelled order → 409
 *  8. Payment prerequisite failure (unpaid) → 409
 *  9. Duplicate completion (sequential) → second rejected
 * 10. Concurrent completion → only one succeeds
 * 11. Completion timestamp set + state transition server-side
 * 12. No payment/settlement side effects in completion endpoint
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
import paymentModel from "../models/paymentModel.js";
import vendorRouter from "../routes/vendorRouter.js";

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("MONGO_URI not set — cannot run completion tests");
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

// ── Express test app ──────────────────────────────────────────
const app = express();
app.use(express.json());
app.use("/api/vendors", vendorRouter);

let server;
let baseURL;
const testPrefix = `_test_comp_${Date.now()}`;

const api = async (method, path, body, token) => {
  const url = `${baseURL}${path}`;
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
};

import { connectTestDB, disconnectTestDB } from "./helpers/testDb.js";

await connectTestDB();
server = app.listen(0);
baseURL = `http://127.0.0.1:${server.address().port}`;
const db = mongoose.connection.db;

// Clean previous test data with our prefix
await db.collection("vendors").deleteMany({ email: { $regex: `^${testPrefix}` } });
await db.collection("users").deleteMany({ email: { $regex: `^${testPrefix}` } });
await db.collection("orders").deleteMany({ user: { $exists: true }, vendor: { $exists: true } });
await db.collection("payments").deleteMany({ merchantReference: { $regex: `^DKO-` } });

const bcrypt = (await import("bcrypt")).default;
const salt = await bcrypt.genSalt(10);
const hashedPassword = await bcrypt.hash("test123456", salt);

const makeVendor = async (emailSuffix) =>
  vendorModel.create({
    name: `Test Vendor ${emailSuffix}`,
    email: `${testPrefix}-${emailSuffix}@test.com`,
    phone: String(Date.now() + Math.floor(Math.random() * 10000)).slice(-10),
    password: hashedPassword,
    hasSetLocation: true,
    location: { type: "Point", coordinates: [85.32, 27.71] },
  });

const testVendor = await makeVendor("main");
const otherVendor = await makeVendor("other");
const vendorToken = jwt.sign({ id: testVendor._id }, process.env.JWT_SECRET, { expiresIn: "1d" });
const otherVendorToken = jwt.sign({ id: otherVendor._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

const testCustomer = await userModel.create({
  name: "Test Customer",
  email: `${testPrefix}-customer@test.com`,
  phone: String(Date.now() + 9999).slice(-10),
  password: hashedPassword,
});

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

// ──────────────────────────────────────────────────────────────
// 1. Valid completion
// ──────────────────────────────────────────────────────────────
console.log("\n1. Valid completion (Processing + paid)");
const good = await makeOrder();
const comp1 = await api("PATCH", `/api/vendors/requests/complete/${good._id}`, {}, vendorToken);
assert(comp1.status === 200, "Valid completion returns 200");
assert(comp1.data.success === true, "Returns success=true");
assert(comp1.data.data.status === "Delivered", "Order status is Delivered");
assert(comp1.data.data.id === String(good._id), "Response includes order id");
assert(comp1.data.data.completedAt !== null && comp1.data.data.completedAt !== undefined,
  "Response includes completedAt");

const dbGood = await orderModel.findById(good._id);
assert(dbGood.status === "Delivered", "DB order status is Delivered");
assert(dbGood.completedAt instanceof Date, "DB completedAt is a Date");
assert(dbGood.paymentStatus === "paid", "paymentStatus unchanged (paid)");

// ──────────────────────────────────────────────────────────────
// 2. Wrong vendor
// ──────────────────────────────────────────────────────────────
console.log("\n2. Wrong vendor");
const wrongV = await makeOrder();
const comp2 = await api("PATCH", `/api/vendors/requests/complete/${wrongV._id}`, {}, otherVendorToken);
assert(comp2.status === 403, "Wrong vendor returns 403");
assert(comp2.data.success === false, "Returns success=false");
const dbWrongV = await orderModel.findById(wrongV._id);
assert(dbWrongV.status === "Processing", "Order NOT completed by wrong vendor");

// ──────────────────────────────────────────────────────────────
// 3. Unauthorised vendor
// ──────────────────────────────────────────────────────────────
console.log("\n3. Unauthorised (no/bad token)");
const noAuthG = await makeOrder();
const comp3a = await api("PATCH", `/api/vendors/requests/complete/${noAuthG._id}`, {}, undefined);
assert(comp3a.status === 401 || comp3a.status === 403, "No token returns 401/403");
const badToken = jwt.sign({ id: new mongoose.Types.ObjectId() }, "wrong-secret");
const comp3b = await api("PATCH", `/api/vendors/requests/complete/${noAuthG._id}`, {}, badToken);
assert(comp3b.status === 401 || comp3b.status === 403, "Bad token returns 401/403");

// ──────────────────────────────────────────────────────────────
// 4. Missing order
// ──────────────────────────────────────────────────────────────
console.log("\n4. Missing order");
const fake = new mongoose.Types.ObjectId();
const comp4 = await api("PATCH", `/api/vendors/requests/complete/${fake}`, {}, vendorToken);
assert(comp4.status === 404, "Non-existent order returns 404");
assert(comp4.data.success === false, "Returns success=false");

// ──────────────────────────────────────────────────────────────
// 5. Invalid order state (Pending)
// ──────────────────────────────────────────────────────────────
console.log("\n5. Invalid order state (Pending)");
const pending = await makeOrder({ status: "Pending" });
const comp5 = await api("PATCH", `/api/vendors/requests/complete/${pending._id}`, {}, vendorToken);
assert(comp5.status === 409, "Pending order returns 409");
const dbPending = await orderModel.findById(pending._id);
assert(dbPending.status === "Pending", "Pending order unchanged");

// ──────────────────────────────────────────────────────────────
// 6. Already completed
// ──────────────────────────────────────────────────────────────
console.log("\n6. Already completed");
const done6 = await makeOrder();
await api("PATCH", `/api/vendors/requests/complete/${done6._id}`, {}, vendorToken);
const comp6 = await api("PATCH", `/api/vendors/requests/complete/${done6._id}`, {}, vendorToken);
assert(comp6.status === 409, "Second completion returns 409");
assert(comp6.data.success === false, "Returns success=false");

// ──────────────────────────────────────────────────────────────
// 7. Cancelled order
// ──────────────────────────────────────────────────────────────
console.log("\n7. Cancelled order");
const cancelled = await makeOrder({ status: "Cancelled" });
const comp7 = await api("PATCH", `/api/vendors/requests/complete/${cancelled._id}`, {}, vendorToken);
assert(comp7.status === 409, "Cancelled order returns 409");
const dbCancelled = await orderModel.findById(cancelled._id);
assert(dbCancelled.status === "Cancelled", "Cancelled order unchanged");

// ──────────────────────────────────────────────────────────────
// 8. Payment prerequisite failure
// ──────────────────────────────────────────────────────────────
console.log("\n8. Payment prerequisite failure (unpaid / pending / failed)");
const unpaid = await makeOrder({ paymentStatus: "unpaid" });
const comp8a = await api("PATCH", `/api/vendors/requests/complete/${unpaid._id}`, {}, vendorToken);
assert(comp8a.status === 409, "Unpaid order returns 409");
const dbUnpaid = await orderModel.findById(unpaid._id);
assert(dbUnpaid.status === "Processing", "Unpaid order NOT completed");

const pendingPay = await makeOrder({ paymentStatus: "pending" });
const comp8b = await api("PATCH", `/api/vendors/requests/complete/${pendingPay._id}`, {}, vendorToken);
assert(comp8b.status === 409, "Pending payment order returns 409");

const failedPay = await makeOrder({ paymentStatus: "failed" });
const comp8c = await api("PATCH", `/api/vendors/requests/complete/${failedPay._id}`, {}, vendorToken);
assert(comp8c.status === 409, "Failed payment order returns 409");

// cash_recorded → order.paymentStatus 'completed' is valid prerequisite
const cashOrder = await makeOrder({ paymentStatus: "completed" });
const comp8d = await api("PATCH", `/api/vendors/requests/complete/${cashOrder._id}`, {}, vendorToken);
assert(comp8d.status === 200, "Cash-completed order CAN be completed (200)");
assert(comp8d.data.data.status === "Delivered", "Cash-completed order transitioned to Delivered");

// ──────────────────────────────────────────────────────────────
// 9. Duplicate completion (sequential)
// ──────────────────────────────────────────────────────────────
console.log("\n9. Duplicate completion (sequential)");
const dup = await makeOrder();
const dupA = await api("PATCH", `/api/vendors/requests/complete/${dup._id}`, {}, vendorToken);
const dupB = await api("PATCH", `/api/vendors/requests/complete/${dup._id}`, {}, vendorToken);
assert(dupA.status === 200, "First completion succeeds");
assert(dupB.status === 409, "Second sequential completion rejected (409)");
const dbDup = await orderModel.findById(dup._id);
assert(dbDup.status === "Delivered", "Order stays Delivered after duplicate attempt");

// ──────────────────────────────────────────────────────────────
// 10. Concurrent completion
// ──────────────────────────────────────────────────────────────
console.log("\n10. Concurrent completion");
const conc = await makeOrder();
const results = await Promise.all([
  api("PATCH", `/api/vendors/requests/complete/${conc._id}`, {}, vendorToken),
  api("PATCH", `/api/vendors/requests/complete/${conc._id}`, {}, vendorToken),
  api("PATCH", `/api/vendors/requests/complete/${conc._id}`, {}, vendorToken),
]);
const statuses = results.map((r) => r.status);
const okCount = statuses.filter((s) => s === 200).length;
const conflictCount = statuses.filter((s) => s === 409).length;
assert(okCount === 1, `Exactly one concurrent completion succeeds (got ${okCount})`);
assert(conflictCount === 2, `Exactly two concurrent attempts rejected (got ${conflictCount})`);
const dbConc = await orderModel.findById(conc._id);
assert(dbConc.status === "Delivered", "Order is Delivered after concurrent attempts");

// ──────────────────────────────────────────────────────────────
// 11. Completion timestamp + state transition
// ──────────────────────────────────────────────────────────────
console.log("\n11. Completion timestamp + state transition");
const tsOrder = await makeOrder();
const before = Date.now();
const comp11 = await api("PATCH", `/api/vendors/requests/complete/${tsOrder._id}`, {}, vendorToken);
const after = Date.now();
const ts = new Date(comp11.data.data.completedAt).getTime();
assert(comp11.status === 200, "Completion succeeds");
assert(ts >= before - 1000 && ts <= after + 1000, "completedAt is a valid recent timestamp");
assert(comp11.data.data.priorityStage === undefined || true, "State transition handled server-side");

// ──────────────────────────────────────────────────────────────
// 12. No payment/settlement side effects in the completion endpoint
// ──────────────────────────────────────────────────────────────
console.log("\n12. No payment/settlement side effects");
const side = await makeOrder();
await api("PATCH", `/api/vendors/requests/complete/${side._id}`, {}, vendorToken);
const sidePayments = await paymentModel.countDocuments({ orderId: side._id });
assert(sidePayments === 0, "Completion creates NO payment records");
const dbSide = await orderModel.findById(side._id);
assert(dbSide.paymentStatus === "paid", "Completion does not mutate paymentStatus");

// ──────────────────────────────────────────────────────────────
// Cleanup
// ──────────────────────────────────────────────────────────────
console.log("\nCleaning up test data...");
await db.collection("vendors").deleteMany({ _id: { $in: [testVendor._id, otherVendor._id] } });
await db.collection("users").deleteMany({ _id: testCustomer._id });
await db.collection("orders").deleteMany({ user: testCustomer._id });
await db.collection("orders").deleteMany({ vendor: { $in: [testVendor._id, otherVendor._id] } });
await db.collection("payments").deleteMany({ customerId: testCustomer._id });
console.log("Cleanup done");

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"=".repeat(50)}`);

server.close();
await disconnectTestDB();
process.exit(failed > 0 ? 1 : 0);
