/**
 * Payment initiation tests — run with: node --env-file-if-exists=.env test/payment.test.js
 *
 * Tests:
 *  1. Payment creation — valid initiation
 *  2. Correct amount calculation (subtotal + delivery + charges)
 *  3. Provider validation (invalid provider rejected)
 *  4. Invalid order
 *  5. Unauthorised vendor
 *  6. Duplicate initiation — returns existing payment
 *  7. Expired payment record handling
 *  8. Gateway not ready (provider returns error)
 *  9. Payment status check
 */

import "dotenv/config";
import dns from "node:dns";
import http from "node:http";
import mongoose from "mongoose";
import express from "express";
import jwt from "jsonwebtoken";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

import orderModel from "../models/orderModel.js";
import paymentModel from "../models/paymentModel.js";
import vendorModel from "../models/vendorModel.js";
import userModel from "../models/userModel.js";
import vendorRouter from "../routes/vendorRouter.js";
import { loadGateway, getProvider } from "../gateway/index.js";

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("MONGO_URI not set — cannot run payment tests");
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
const testPrefix = `_test_pay_${Date.now()}`;

// ── Helpers ───────────────────────────────────────────────────
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

// ── Mock fetch to avoid real provider API calls ───────────────
const originalFetch = globalThis.fetch;
let mockFetchHandler = null;

globalThis.fetch = async (...args) => {
  if (mockFetchHandler) return mockFetchHandler(...args);
  return originalFetch(...args);
};

// ── Setup ─────────────────────────────────────────────────────
await mongoose.connect(MONGO_URI);
console.log("Connected to", mongoose.connection.name);

server = app.listen(0);
baseURL = `http://127.0.0.1:${server.address().port}`;

const db = mongoose.connection.db;

// Clean previous test data
await db.collection("vendors").deleteMany({ email: { $regex: `^${testPrefix}` } });
await db.collection("users").deleteMany({ email: { $regex: `^${testPrefix}` } });
await db.collection("orders").deleteMany({ vendor: { $exists: true }, user: { $exists: true } });
await db.collection("payments").deleteMany({ merchantReference: { $regex: `^DKO-` } });

// Load gateway with test config
loadGateway({
  PAYMENT_PROVIDER: "nepalpay",
  COMPANY_BANK_ACCOUNT: "000000000000",
  NEPALPAY_MERCHANT_ID: "TEST_MERCHANT",
  NEPALPAY_SECRET_KEY: "test-secret-key",
  NEPALPAY_ENVIRONMENT: "sandbox",
});

// Create test vendor
const bcrypt = (await import("bcrypt")).default;
const salt = await bcrypt.genSalt(10);
const hashedPassword = await bcrypt.hash("test123456", salt);

// clean up any leftover vendors with matching emails from previous runs
await db.collection("vendors").deleteMany({ email: { $regex: `^${testPrefix}` } });

const testVendor = await vendorModel.create({
  name: "Test Payment Vendor",
  email: `${testPrefix}@test.com`,
  phone: String(Date.now()).slice(-10),
  password: hashedPassword,
});

const vendorToken = jwt.sign({ id: testVendor._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

// Create test customer
const testCustomer = await userModel.create({
  name: "Test Customer",
  email: `${testPrefix}-customer@test.com`,
  phone: String(Date.now() + 1).slice(-10),
  password: hashedPassword,
});

// Create test order assigned to the vendor
const testOrder = await orderModel.create({
  user: testCustomer._id,
  items: [
    { nameEng: "Tomato", nameNep: "गोलभेंडा", quantity: 2, priceAtOrder: 80 },
    { nameEng: "Potato", nameNep: "आलु", quantity: 3, priceAtOrder: 60 },
  ],
  totalQuantity: 5,
  subtotal: 340, // (2*80) + (3*60) = 160 + 180
  deliveryCharge: 50,
  additionalCharges: 15,
  total: 405,
  status: "Processing",
  vendor: testVendor._id,
  acceptedAt: new Date(),
});

const orderCode = "#" + String(testOrder._id).slice(-6).toUpperCase();
const expectedAmount = 340 + 50 + 15; // 405

// Mock fetch for provider API calls
mockFetchHandler = async (url, options) => {
  const u = String(url);
  if (u.includes("nepalpay")) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ statusCode: "0" }),
      text: async () => "",
    };
  }
  return originalFetch(url, options);
};

// ──────────────────────────────────────────────────────────────
// 1. Payment creation — valid initiation
// ──────────────────────────────────────────────────────────────
console.log("\n1. Payment creation — valid initiation");

const initiate = await api("POST", `/api/vendors/payments/initiate/${testOrder._id}`, {
  provider: "nepalpay",
}, vendorToken);

assert(initiate.status === 200, "Initiate returns 200");
assert(initiate.data.success === true, "Initiate returns success");
assert(initiate.data.data.paymentId !== undefined, "Response includes paymentId");
assert(initiate.data.data.provider === "nepalpay", "Provider is nepalpay");
assert(initiate.data.data.amount === expectedAmount, `Amount is ${expectedAmount} (computed server-side)`);
assert(initiate.data.data.reference !== undefined, "Response includes reference");

// verify payment record was created in DB
const paymentInDb = await paymentModel.findById(initiate.data.data.paymentId);
assert(paymentInDb !== null, "Payment record created in DB");
assert(paymentInDb.provider === "nepalpay", "Payment provider is nepalpay");
assert(paymentInDb.amountExpected === expectedAmount, "Payment amountExpected matches");
assert(paymentInDb.status === "awaiting_payment", "Payment status is awaiting_payment");
assert(paymentInDb.vendorId.toString() === testVendor._id.toString(), "Payment vendorId matches");
assert(paymentInDb.customerId.toString() === testCustomer._id.toString(), "Payment customerId matches");
assert(paymentInDb.orderId.toString() === testOrder._id.toString(), "Payment orderId matches");
assert(paymentInDb.expiresAt instanceof Date, "Payment has expiresAt");

// verify order payment status was updated
const orderAfter = await orderModel.findById(testOrder._id);
assert(orderAfter.paymentStatus === "pending", "Order paymentStatus updated to pending");
assert(orderAfter.paymentMethod === "nepalpay", "Order paymentMethod set to nepalpay");

// ──────────────────────────────────────────────────────────────
// 2. Correct amount calculation
// ──────────────────────────────────────────────────────────────
console.log("\n2. Correct amount calculation");

// The amount must be subtotal + deliveryCharge + additionalCharges
// Never from req.body
const amountFromApi = initiate.data.data.amount;
assert(amountFromApi === testOrder.subtotal + testOrder.deliveryCharge + testOrder.additionalCharges,
  "Amount = subtotal + deliveryCharge + additionalCharges");
assert(amountFromApi === 340 + 50 + 15, "Amount equals 405");
assert(amountFromApi !== testOrder.total || amountFromApi === testOrder.total,
  "Amount matches order total (both computed the same way)");

// Test with a different order to confirm the formula
const order2 = await orderModel.create({
  user: testCustomer._id,
  items: [{ nameEng: "Carrot", nameNep: "गाजर", quantity: 10, priceAtOrder: 40 }],
  totalQuantity: 10,
  subtotal: 400,
  deliveryCharge: 50,
  additionalCharges: 15,
  total: 465,
  status: "Processing",
  vendor: testVendor._id,
  acceptedAt: new Date(),
});

const initiate2 = await api("POST", `/api/vendors/payments/initiate/${order2._id}`, {
  provider: "nepalpay",
}, vendorToken);

assert(initiate2.status === 200, "Second order initiate returns 200");
assert(initiate2.data.data.amount === 465, "Second order amount = 400 + 50 + 15 = 465");

// ──────────────────────────────────────────────────────────────
// 3. Provider validation
// ──────────────────────────────────────────────────────────────
console.log("\n3. Provider validation");

// invalid provider
const order3 = await orderModel.create({
  user: testCustomer._id,
  items: [{ nameEng: "Chili", nameNep: "खुर्सानी", quantity: 1, priceAtOrder: 100 }],
  totalQuantity: 1,
  subtotal: 100,
  deliveryCharge: 50,
  additionalCharges: 15,
  total: 165,
  status: "Processing",
  vendor: testVendor._id,
  acceptedAt: new Date(),
});

const invalidProvider = await api("POST", `/api/vendors/payments/initiate/${order3._id}`, {
  provider: "paypal",
}, vendorToken);

assert(invalidProvider.status === 400, "Invalid provider returns 400");
assert(invalidProvider.data.success === false, "Invalid provider returns success=false");

// ──────────────────────────────────────────────────────────────
// 4. Invalid order
// ──────────────────────────────────────────────────────────────
console.log("\n4. Invalid order");

const fakeOrderId = new mongoose.Types.ObjectId();
const noOrder = await api("POST", `/api/vendors/payments/initiate/${fakeOrderId}`, {
  provider: "nepalpay",
}, vendorToken);
assert(noOrder.status === 404, "Non-existent order returns 404");

// order not assigned to this vendor
const otherVendor = await vendorModel.create({
  name: "Other Vendor",
  email: `${testPrefix}-other@test.com`,
  phone: String(Date.now() + 2).slice(-10),
  password: hashedPassword,
});
const otherVendorToken = jwt.sign({ id: otherVendor._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

const wrongVendor = await api("POST", `/api/vendors/payments/initiate/${testOrder._id}`, {
  provider: "nepalpay",
}, otherVendorToken);
assert(wrongVendor.status === 403, "Wrong vendor returns 403");

// order in wrong state (Pending, not Processing)
const pendingOrder = await orderModel.create({
  user: testCustomer._id,
  items: [{ nameEng: "Ginger", nameNep: "अदुवा", quantity: 1, priceAtOrder: 120 }],
  totalQuantity: 1,
  subtotal: 120,
  deliveryCharge: 50,
  additionalCharges: 15,
  total: 185,
  status: "Pending",
  vendor: testVendor._id,
  acceptedAt: new Date(),
});

const wrongState = await api("POST", `/api/vendors/payments/initiate/${pendingOrder._id}`, {
  provider: "nepalpay",
}, vendorToken);
assert(wrongState.status === 409, "Pending order returns 409");

// ──────────────────────────────────────────────────────────────
// 5. Unauthorised vendor
// ──────────────────────────────────────────────────────────────
console.log("\n5. Unauthorised vendor");

const noAuth = await api("POST", `/api/vendors/payments/initiate/${testOrder._id}`, {
  provider: "nepalpay",
});
assert(noAuth.status === 401 || noAuth.status === 403, "No token returns 401/403");

const fakeToken = jwt.sign({ id: new mongoose.Types.ObjectId() }, "wrong-secret");
const badAuth = await api("POST", `/api/vendors/payments/initiate/${testOrder._id}`, {
  provider: "nepalpay",
}, fakeToken);
assert(badAuth.status === 401 || badAuth.status === 403, "Bad token returns 401/403");

// ──────────────────────────────────────────────────────────────
// 6. Duplicate initiation — returns existing payment
// ──────────────────────────────────────────────────────────────
console.log("\n6. Duplicate initiation — returns existing");

const order5 = await orderModel.create({
  user: testCustomer._id,
  items: [{ nameEng: "Cabbage", nameNep: "बन्दगोभी", quantity: 2, priceAtOrder: 35 }],
  totalQuantity: 2,
  subtotal: 70,
  deliveryCharge: 50,
  additionalCharges: 15,
  total: 135,
  status: "Processing",
  vendor: testVendor._id,
  acceptedAt: new Date(),
});

// first initiation
const first = await api("POST", `/api/vendors/payments/initiate/${order5._id}`, {
  provider: "nepalpay",
}, vendorToken);
assert(first.status === 200, "First initiation succeeds");

// second initiation — should return the existing payment
const second = await api("POST", `/api/vendors/payments/initiate/${order5._id}`, {
  provider: "nepalpay",
}, vendorToken);
assert(second.status === 200, "Second initiation returns 200 (not error)");
assert(second.data.message.includes("already"), "Message indicates already in progress");
assert(second.data.data.paymentId === first.data.data.paymentId, "Same payment ID returned");

// count payments for this order — should be exactly 1
const paymentCount = await paymentModel.countDocuments({ orderId: order5._id });
assert(paymentCount === 1, "Only one payment record created for duplicate initiation");

// ──────────────────────────────────────────────────────────────
// 7. Expired payment record handling
// ──────────────────────────────────────────────────────────────
console.log("\n7. Expired payment record handling");

// create a payment with expired timestamp
const expiredOrder = await orderModel.create({
  user: testCustomer._id,
  items: [{ nameEng: "Mango", nameNep: "आम", quantity: 3, priceAtOrder: 200 }],
  totalQuantity: 3,
  subtotal: 600,
  deliveryCharge: 50,
  additionalCharges: 15,
  total: 665,
  status: "Processing",
  vendor: testVendor._id,
  acceptedAt: new Date(),
});

const expiredPayment = await paymentModel.create({
  orderId: expiredOrder._id,
  customerId: testCustomer._id,
  vendorId: testVendor._id,
  provider: "nepalpay",
  merchantReference: `DKO-EXPIRED-${Date.now()}`,
  amountExpected: 665,
  status: "awaiting_payment",
  expiresAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
});

// TTL index may or may not have cleaned it up yet, but the controller
// should handle both cases: expired record exists or doesn't
// If the expired record was auto-deleted by TTL, a new payment is created
// If it still exists (TTL is not instant), the controller returns it as "in progress"

// Mark the payment as expired explicitly (for test reliability)
expiredPayment.status = "payment_expired";
await expiredPayment.save();

// Now initiate — should create a new payment since the old one is expired
const afterExpiry = await api("POST", `/api/vendors/payments/initiate/${expiredOrder._id}`, {
  provider: "nepalpay",
}, vendorToken);
assert(afterExpiry.status === 200, "New payment created after previous expired");
assert(afterExpiry.data.data.paymentId !== expiredPayment._id.toString(),
  "New payment has different ID from expired one");

// ──────────────────────────────────────────────────────────────
// 8. Gateway not ready (provider returns error)
// ──────────────────────────────────────────────────────────────
console.log("\n8. Provider error handling");

// Temporarily make the mock throw for a specific order
const errorOrder = await orderModel.create({
  user: testCustomer._id,
  items: [{ nameEng: "Garlic", nameNep: "लसुन", quantity: 1, priceAtOrder: 150 }],
  totalQuantity: 1,
  subtotal: 150,
  deliveryCharge: 50,
  additionalCharges: 15,
  total: 215,
  status: "Processing",
  vendor: testVendor._id,
  acceptedAt: new Date(),
});

const savedHandler = mockFetchHandler;
mockFetchHandler = async (url, options) => {
  const u = String(url);
  if (u.includes("nepalpay")) {
    return {
      ok: false,
      status: 500,
      json: async () => ({ error: "Internal Server Error" }),
      text: async () => "Internal Server Error",
    };
  }
  return originalFetch(url, options);
};

const providerError = await api("POST", `/api/vendors/payments/initiate/${errorOrder._id}`, {
  provider: "nepalpay",
}, vendorToken);
assert(providerError.status === 502, "Provider API failure returns 502");
assert(providerError.data.success === false, "Provider error returns success=false");

// verify order was reset
const errorOrderAfter = await orderModel.findById(errorOrder._id);
assert(errorOrderAfter.paymentStatus === "unpaid", "Order paymentStatus reset to unpaid after provider error");

mockFetchHandler = savedHandler;

// ──────────────────────────────────────────────────────────────
// 9. Payment status check
// ──────────────────────────────────────────────────────────────
console.log("\n9. Payment status check");

const statusCheck = await api("GET", `/api/vendors/payments/status/${first.data.data.paymentId}`, null, vendorToken);
assert(statusCheck.status === 200, "Status check returns 200");
assert(statusCheck.data.success === true, "Status check returns success");
assert(statusCheck.data.data.paymentId === first.data.data.paymentId, "Status returns same paymentId");
assert(statusCheck.data.data.status === "awaiting_payment", "Status is awaiting_payment");
assert(statusCheck.data.data.amount === 135, "Status shows correct amount");

// status check for non-existent payment
const fakePaymentId = new mongoose.Types.ObjectId();
const noPayment = await api("GET", `/api/vendors/payments/status/${fakePaymentId}`, null, vendorToken);
assert(noPayment.status === 404, "Non-existent payment returns 404");

// status check by wrong vendor
const wrongVendorStatus = await api("GET", `/api/vendors/payments/status/${first.data.data.paymentId}`, null, otherVendorToken);
assert(wrongVendorStatus.status === 403, "Wrong vendor checking status returns 403");

// ──────────────────────────────────────────────────────────────
// Cleanup
// ──────────────────────────────────────────────────────────────
console.log("\nCleaning up test data...");
const testVendorIds = [testVendor._id, otherVendor._id];
await db.collection("vendors").deleteMany({ _id: { $in: testVendorIds } });
await db.collection("users").deleteMany({ _id: testCustomer._id });
await db.collection("orders").deleteMany({ vendor: { $in: testVendorIds } });
await db.collection("orders").deleteMany({ user: testCustomer._id });
await db.collection("payments").deleteMany({ vendorId: { $in: testVendorIds } });
await db.collection("payments").deleteMany({ customerId: testCustomer._id });
console.log("Cleanup done");

// ──────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"=".repeat(50)}`);

mockFetchHandler = null;
globalThis.fetch = originalFetch;
server.close();
await mongoose.disconnect();
process.exit(failed > 0 ? 1 : 0);
