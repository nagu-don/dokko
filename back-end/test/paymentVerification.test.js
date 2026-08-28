/**
 * Payment verification tests — run with: node --env-file-if-exists=.env test/paymentVerification.test.js
 *
 * Tests:
 *  1. Successful mock payment completion + verification
 *  2. NepalPay QR payment initiation
 *  3. Wrong reference — payment not found
 *  4. Duplicate completion — idempotent (no duplicate settlement/order update)
 *  5. Failed provider verification — payment_failed (NepalPay)
 *  6. Expired payment — completion arrives too late
 *  7. Frontend spoofing — no real provider transaction / unauthenticated
 *  8. Repeated vendor-triggered verification
 *  9. Settlement created with correct financial breakdown
 * 10. Order paymentStatus updated to "paid" after verification
 */

import "dotenv/config";
import dns from "node:dns";
import mongoose from "mongoose";
import express from "express";
import jwt from "jsonwebtoken";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

import orderModel from "../models/orderModel.js";
import paymentModel from "../models/paymentModel.js";
import settlementModel from "../models/settlementModel.js";
import vendorModel from "../models/vendorModel.js";
import userModel from "../models/userModel.js";
import vendorRouter from "../routes/vendorRouter.js";
import { loadGateway } from "../gateway/index.js";

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("MONGO_URI not set — cannot run payment verification tests");
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
const testPrefix = `_test_verify_${Date.now()}`;

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
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
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
await db.collection("orders").deleteMany({ user: { $exists: true }, vendor: { $exists: true } });
await db.collection("payments").deleteMany({ merchantReference: { $regex: `^DKO-` } });
await db.collection("settlements").deleteMany({});

// Load gateway with test config — only nepalpay and mock are supported.
loadGateway({
  PAYMENT_PROVIDER: "mock",
  COMPANY_BANK_ACCOUNT: "000000000000",
  MOCK_PAYMENT_ENABLED: "true",
  NEPALPAY_MODE: "emvco_test",
  NCHL_MERCHANT_ACCOUNT_TEMPLATE: "26220018DOKKO000012345678",
  NODE_ENV: "test",
});

// Create test vendor with payout details
const bcrypt = (await import("bcrypt")).default;
const salt = await bcrypt.genSalt(10);
const hashedPassword = await bcrypt.hash("test123456", salt);

await db.collection("vendors").deleteMany({ email: { $regex: `^${testPrefix}` } });

const testVendor = await vendorModel.create({
  name: "Test Verification Vendor",
  email: `${testPrefix}@test.com`,
  phone: String(Date.now()).slice(-10),
  password: hashedPassword,
  payoutMethod: "bank",
  payoutBankName: "Nabil Bank",
  payoutAccountNumber: "1234567890",
  payoutAccountHolder: "Test Vendor",
});

const vendorToken = jwt.sign({ id: testVendor._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

// Create test customer
const testCustomer = await userModel.create({
  name: "Test Verify Customer",
  email: `${testPrefix}-customer@test.com`,
  phone: String(Date.now() + 1).slice(-10),
  password: hashedPassword,
});

// Helper: create an order + initiate payment, return both
const createOrderAndPayment = async (opts = {}) => {
  const order = await orderModel.create({
    user: testCustomer._id,
    items: [{ nameEng: "Tomato", nameNep: "गोलभेंडा", quantity: 2, priceAtOrder: 80 }],
    totalQuantity: 2,
    subtotal: opts.subtotal || 160,
    deliveryCharge: 50,
    additionalCharges: 15,
    total: (opts.subtotal || 160) + 50 + 15,
    status: "Processing",
    vendor: testVendor._id,
    acceptedAt: new Date(),
  });

  const initiate = await api("POST", `/api/vendors/payments/initiate/${order._id}`, {
    provider: opts.provider || "mock",
  }, vendorToken);

  return { order, paymentId: initiate.data.data.paymentId, reference: initiate.data.data.reference };
};

// ══════════════════════════════════════════════════════════════
// 1. Successful mock payment completion + verification
// ══════════════════════════════════════════════════════════════
console.log("\n1. Successful mock payment completion + verification");

const { order: order1, paymentId: payId1, reference: ref1 } = await createOrderAndPayment();

// Simulate the mock provider completing the payment
const cb1 = await api("POST", `/api/vendors/payments/mock/${payId1}/complete`, {}, vendorToken);
assert(cb1.status === 200, "Mock completion returns 200");
assert(cb1.data.success === true, "Mock completion returns success");

// Verify payment record updated
const pay1 = await paymentModel.findById(payId1);
assert(pay1.status === "payment_verified", "Payment status is payment_verified");
assert(pay1.providerTransactionId === `MOCK-${pay1.merchantReference}`, "Provider transaction ID set");
assert(pay1.paidAt instanceof Date, "paidAt is set");
assert(pay1.verifiedAt instanceof Date, "verifiedAt is set");
assert(pay1.providerPayload !== null, "Provider payload stored");

// Verify order updated
const ord1 = await orderModel.findById(order1._id);
assert(ord1.paymentStatus === "paid", "Order paymentStatus is paid");

// Verify settlement created
const sett1 = await settlementModel.findOne({ orderId: order1._id });
assert(sett1 !== null, "Settlement created");
assert(sett1.vendorId.toString() === testVendor._id.toString(), "Settlement vendorId matches");
assert(sett1.paymentId.toString() === payId1.toString(), "Settlement paymentId matches");
assert(sett1.status === "pending", "Settlement status is pending");
assert(sett1.payoutDestination.method === "bank", "Settlement payout method snapped");
assert(sett1.payoutDestination.bankName === "Nabil Bank", "Settlement bank name snapped");
assert(sett1.payoutDestination.accountHolder === "Test Vendor", "Settlement account holder snapped");

// ══════════════════════════════════════════════════════════════
// 2. NepalPay QR payment initiation
// ══════════════════════════════════════════════════════════════
console.log("\n2. NepalPay QR payment initiation");

const { order: order2, paymentId: payId2 } = await createOrderAndPayment({ provider: "nepalpay" });

const initiate2 = await api("GET", `/api/vendors/payments/status/${payId2}`, {}, vendorToken);
assert(initiate2.status === 200, "NepalPay status returns 200");
assert(initiate2.data.data.status === "qr_generated", "NepalPay payment status is qr_generated");
assert(typeof initiate2.data.data.qrData === "string" && initiate2.data.data.qrData.length > 0, "NepalPay QR payload generated");

// NepalPay is a scan-and-pay network QR; the backend cannot self-verify it in
// this environment (its verifyPayment reports NEPALQR_NETWORK_VALIDATION_PENDING).
// See test 5 for the failed-verification behaviour.

// ══════════════════════════════════════════════════════════════
// 3. Wrong reference — payment not found
// ══════════════════════════════════════════════════════════════
console.log("\n3. Wrong reference — payment not found");

const cb3 = await api("POST", `/api/vendors/payments/verify/${new mongoose.Types.ObjectId()}`, {}, vendorToken);
assert(cb3.status === 404, "Non-existent payment returns 404");

// ══════════════════════════════════════════════════════════════
// 4. Duplicate completion — idempotent
// ══════════════════════════════════════════════════════════════
console.log("\n4. Duplicate completion — idempotent");

// Use order1 which was already verified in test 1
const cb4a = await api("POST", `/api/vendors/payments/mock/${payId1}/complete`, {}, vendorToken);
assert(cb4a.status === 200, "Duplicate completion returns 200 (not error)");

// Verify no duplicate settlement
const settCount4 = await settlementModel.countDocuments({ orderId: order1._id });
assert(settCount4 === 1, "Still only one settlement for duplicate completion");

// Verify order status unchanged
const ord4 = await orderModel.findById(order1._id);
assert(ord4.paymentStatus === "paid", "Order paymentStatus still paid (not double-processed)");

// Payment should still be verified (not changed)
const pay4 = await paymentModel.findById(payId1);
assert(pay4.status === "payment_verified", "Payment still payment_verified after duplicate");

// ══════════════════════════════════════════════════════════════
// 5. Failed provider verification — payment_failed (NepalPay)
// ══════════════════════════════════════════════════════════════
console.log("\n5. Failed provider verification — payment_failed (NepalPay)");

// Use order2 (NepalPay, QR generated in test 2). NepalPay cannot be
// self-verified by the backend, so verification must fail.
await paymentModel.findByIdAndUpdate(payId2, { providerTransactionId: "NP-TXN-002" });

const verify5 = await api("POST", `/api/vendors/payments/verify/${payId2}`, {}, vendorToken);
assert(verify5.status === 400, "Failed verification returns 400");

const pay5 = await paymentModel.findById(payId2);
assert(pay5.status === "payment_failed", "Payment status is payment_failed");
assert(pay5.failureReason.includes("Provider verification failed"), "Failure reason mentions provider verification");

const ord5 = await orderModel.findById(order2._id);
assert(ord5.paymentStatus === "pending", "Order paymentStatus remains pending");

const sett5 = await settlementModel.findOne({ orderId: order2._id });
assert(sett5 === null, "No settlement created on failed verification");

// ══════════════════════════════════════════════════════════════
// 6. Expired payment — completion arrives too late
// ══════════════════════════════════════════════════════════════
console.log("\n6. Expired payment — completion arrives too late");

const { order: order6, paymentId: payId6 } = await createOrderAndPayment();

// Manually expire the payment
await paymentModel.findByIdAndUpdate(payId6, {
  expiresAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
});

const cb6 = await api("POST", `/api/vendors/payments/mock/${payId6}/complete`, {}, vendorToken);
assert(cb6.status === 400, "Expired payment completion returns 400");

const pay6 = await paymentModel.findById(payId6);
assert(pay6.status === "payment_expired", "Payment status is payment_expired");

const ord6 = await orderModel.findById(order6._id);
assert(ord6.paymentStatus === "pending", "Order paymentStatus remains pending for expired payment");

// ══════════════════════════════════════════════════════════════
// 7. Frontend spoofing — no real provider transaction / unauthenticated
// ══════════════════════════════════════════════════════════════
console.log("\n7. Frontend spoofing — no real provider transaction");

// An attacker calling the completion endpoint directly without a vendor
// token must be rejected (no client-controlled "mark paid" path).
const { order: order7, paymentId: payId7 } = await createOrderAndPayment();

const spoof7a = await api("POST", `/api/vendors/payments/mock/${payId7}/complete`, {});
assert(spoof7a.status === 401, "Unauthenticated completion is rejected (401)");

// Completing a payment that does not belong to the mock provider must fail.
const spoof7b = await api("POST", `/api/vendors/payments/mock/${payId2}/complete`, {}, vendorToken);
assert(spoof7b.status === 404, "Completion of a non-mock payment returns 404");

// ══════════════════════════════════════════════════════════════
// 8. Repeated vendor-triggered verification
// ══════════════════════════════════════════════════════════════
console.log("\n8. Repeated vendor-triggered verification");

// Use order1 (mock, already verified in test 1)
const verify1 = await api("POST", `/api/vendors/payments/verify/${payId1}`, {}, vendorToken);
assert(verify1.status === 200, "First repeated verify returns 200");
assert(verify1.data.success === true, "Repeated verify returns success");

// Second verification — should still succeed (idempotent)
const verify2 = await api("POST", `/api/vendors/payments/verify/${payId1}`, {}, vendorToken);
assert(verify2.status === 200, "Second repeated verify returns 200");
assert(verify2.data.success === true, "Second repeated verify returns success");

// Settlement count should still be 1
const settCount8 = await settlementModel.countDocuments({ orderId: order1._id });
assert(settCount8 === 1, "Still only one settlement after repeated verification");

// ══════════════════════════════════════════════════════════════
// 9. Settlement created with correct financial breakdown
// ══════════════════════════════════════════════════════════════
console.log("\n9. Settlement financial breakdown");

// Use settlement from test 1 (order1, subtotal=160, delivery=50, charges=15)
const sett9 = await settlementModel.findOne({ orderId: order1._id });
assert(sett9.customerPaymentAmount === 225, "customerPaymentAmount = subtotal + delivery + charges");
assert(sett9.goodsAmount === 160, "goodsAmount = subtotal");
assert(sett9.deliveryAmount === 50, "deliveryAmount = delivery charge");
assert(sett9.additionalChargesAmount === 15, "additionalChargesAmount = charges");
assert(sett9.companyAmount === 65, "companyAmount = delivery + charges");
assert(sett9.vendorAmount === 160, "vendorAmount = goods amount");
assert(sett9.customerPaymentAmount === sett9.companyAmount + sett9.vendorAmount,
  "customerPayment = company + vendor");
assert(sett9.currency === "NPR", "Currency is NPR");

// ══════════════════════════════════════════════════════════════
// 10. Order paymentStatus lifecycle
// ══════════════════════════════════════════════════════════════
console.log("\n10. Order paymentStatus lifecycle");

// order1: should be "paid" (verified in test 1)
const ord10a = await orderModel.findById(order1._id);
assert(ord10a.paymentStatus === "paid", "Verified order has paymentStatus=paid");

// order6: should be "pending" (expired in test 6)
const ord10b = await orderModel.findById(order6._id);
assert(ord10b.paymentStatus === "pending", "Expired order has paymentStatus=pending");

// order2: should be "pending" (failed NepalPay verification in test 5)
const ord10c = await orderModel.findById(order2._id);
assert(ord10c.paymentStatus === "pending", "Failed verification order has paymentStatus=pending");

// ══════════════════════════════════════════════════════════════
// Cleanup
// ══════════════════════════════════════════════════════════════
console.log("\nCleaning up test data...");
await db.collection("vendors").deleteMany({ _id: testVendor._id });
await db.collection("users").deleteMany({ _id: testCustomer._id });
await db.collection("orders").deleteMany({ user: testCustomer._id });
await db.collection("payments").deleteMany({ vendorId: testVendor._id });
await db.collection("settlements").deleteMany({ vendorId: testVendor._id });
console.log("Cleanup done");

// ──────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"=".repeat(50)}`);

server.close();
await mongoose.disconnect();
process.exit(failed > 0 ? 1 : 0);
