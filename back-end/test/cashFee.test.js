/**
 * Cash-handling-fee clawback tests (FIN-001) — run with:
 *   node --env-file-if-exists=.env test/cashFee.test.js
 *
 * Tests:
 *  1. recordCashPayment stores cashHandlingFee = order.additionalCharges (not 5% of total)
 *  2. Outstanding cash fee is clawed back from the vendor's next non-cash settlement
 *  3. Oldest-first: multiple outstanding fees are all clawed back by one settlement
 *  4. Whole-record carry-forward: a fee too large for one settlement is left for the next
 *  5. Floor at zero: vendorAmount never goes negative
 *  6. Revoked cash payments are voided from the outstanding pool
 *  7. Vendor isolation: one vendor's fees never reduce another vendor's settlement
 *  8. Concurrency: a fee is deducted exactly once across simultaneous settlements
 *  9. No outstanding fees → settlement stores cashFeesDeducted = 0
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
import commissionConfigModel from "../models/commissionConfigModel.js";
import companyAccountModel from "../models/companyAccountModel.js";
import vendorRouter from "../routes/vendorRouter.js";
import { loadGateway } from "../gateway/index.js";

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("MONGO_URI not set — cannot run cashFee tests");
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
const testPrefix = `_test_cashfee_${Date.now()}`;

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

await db.collection("vendors").deleteMany({ email: { $regex: `^${testPrefix}` } });
await db.collection("users").deleteMany({ email: { $regex: `^${testPrefix}` } });
await db.collection("admins").deleteMany({ email: { $regex: `^${testPrefix}` } });
await db.collection("orders").deleteMany({});
await db.collection("payments").deleteMany({});
await db.collection("settlements").deleteMany({});
await db.collection("commissionconfigs").deleteMany({});
await db.collection("companyaccounts").deleteMany({});

loadGateway({
  PAYMENT_PROVIDER: "mock",
  COMPANY_BANK_ACCOUNT: "000000000000",
});

// Fixed commission config (the production default mode)
await commissionConfigModel.create({
  companyFeeType: "fixed",
  deliveryCharge: 50,
  additionalCharges: 15,
  commissionPercentage: 0,
  minimumCommission: 0,
});

const bcrypt = (await import("bcrypt")).default;
const salt = await bcrypt.genSalt(10);
const hashedPassword = await bcrypt.hash("test123456", salt);

// Test vendor A
const vendorA = await vendorModel.create({
  name: "CashFee Vendor A",
  email: `${testPrefix}@test.com`,
  phone: String(Date.now()).slice(-10),
  password: hashedPassword,
  payoutMethod: "bank",
  payoutBankName: "Nabil Bank",
  payoutAccountNumber: "1234567890",
  payoutAccountHolder: "Vendor A",
});
const tokenA = jwt.sign({ id: vendorA._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

// Test vendor B (isolation checks)
const vendorB = await vendorModel.create({
  name: "CashFee Vendor B",
  email: `${testPrefix}-b@test.com`,
  phone: String(Date.now() + 2).slice(-10),
  password: hashedPassword,
  payoutMethod: "bank",
  payoutBankName: "Global IME Bank",
  payoutAccountNumber: "9876543210",
  payoutAccountHolder: "Vendor B",
});
const tokenB = jwt.sign({ id: vendorB._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

const testCustomer = await userModel.create({
  name: "CashFee Customer",
  email: `${testPrefix}-customer@test.com`,
  phone: String(Date.now() + 1).slice(-10),
  password: hashedPassword,
});

// ── Helpers ───────────────────────────────────────────────────
const createOrder = async ({ vendorId, subtotal, deliveryCharge = 50, additionalCharges = 15 }) => {
  return orderModel.create({
    user: testCustomer._id,
    items: [{ nameEng: "Tomato", nameNep: "\u0917\u094b\u0932\u092d\u0947\u0902\u0921\u093e", quantity: 2, priceAtOrder: 80 }],
    totalQuantity: 2,
    subtotal,
    deliveryCharge,
    additionalCharges,
    total: subtotal + deliveryCharge + additionalCharges,
    status: "Processing",
    vendor: vendorId,
    acceptedAt: new Date(),
  });
};

const recordCash = async (orderId, token) =>
  api("POST", `/api/vendors/payments/cash/${orderId}`, {}, token);

const createDigitalOrderAndInitiate = async (order, token) => {
  const initiate = await api("POST", `/api/vendors/payments/initiate/${order._id}`, {
    provider: "mock",
  }, token);
  return initiate.data.data.paymentId;
};

const completeMock = async (paymentId, token) =>
  api("POST", `/api/vendors/payments/mock/${paymentId}/complete`, {}, token);

const settleDigital = async ({ subtotal, vendorId, token, additionalCharges = 15 }) => {
  const order = await createOrder({ vendorId, subtotal, additionalCharges });
  const paymentId = await createDigitalOrderAndInitiate(order, token);
  const res = await completeMock(paymentId, token);
  assert(res.status === 200, `Digital order ${subtotal} settled (completion ok)`);
  return settlementModel.findOne({ orderId: order._id });
};

// ══════════════════════════════════════════════════════════════
// 1. Cash fee = order.additionalCharges (not 5% of total)
// ══════════════════════════════════════════════════════════════
console.log("\n1. Cash handling fee equals order.additionalCharges");

const cashOrd1 = await createOrder({ vendorId: vendorA._id, subtotal: 1000, additionalCharges: 15 });
const cashRes1 = await recordCash(cashOrd1._id, tokenA);
assert(cashRes1.status === 200, "Cash payment recorded");

const cashPay1 = await paymentModel.findOne({ orderId: cashOrd1._id, provider: "cash" });
assert(cashPay1 !== null, "Cash payment record exists");
assert(cashPay1.status === "cash_recorded", "Cash payment status is cash_recorded");
assert(cashPay1.cashFeeDeducted === false, "Fee starts undeducted");
assert(cashPay1.cashHandlingFee === 15, "cashHandlingFee = 15 (additionalCharges)");
assert(cashPay1.cashHandlingFee !== 53.25, "cashHandlingFee is not 5% of the 1065 total");
assert(cashPay1.amountExpected === 1065, "Amount expected still the full order total");

// ══════════════════════════════════════════════════════════════
// 2. Outstanding fee clawed back from next non-cash settlement
// ══════════════════════════════════════════════════════════════
console.log("\n2. Outstanding cash fee clawed back from next settlement");

const sett2 = await settleDigital({ vendorId: vendorA._id, token: tokenA, subtotal: 1000 });

assert(sett2 !== null, "Settlement created");
assert(sett2.vendorAmount === 985, "vendorAmount = 985 (1000 goods - 15 fee)");
assert(sett2.cashFeesDeducted === 15, "cashFeesDeducted = 15 recorded on settlement");
assert(sett2.customerPaymentAmount === sett2.companyAmount + sett2.vendorAmount + sett2.cashFeesDeducted,
  "customerPayment = company + vendor + cashFeesDeducted");

const cashPay1After = await paymentModel.findById(cashPay1._id);
assert(cashPay1After.cashFeeDeducted === true, "Cash fee record marked deducted");

// ══════════════════════════════════════════════════════════════
// 3. Oldest-first: multiple outstanding fees all clawed back
// ══════════════════════════════════════════════════════════════
console.log("\n3. Multiple outstanding fees clawed back by one settlement");

const m1 = await createOrder({ vendorId: vendorA._id, subtotal: 300, additionalCharges: 15 });
const m2 = await createOrder({ vendorId: vendorA._id, subtotal: 400, additionalCharges: 15 });
await recordCash(m1._id, tokenA);
await recordCash(m2._id, tokenA);

const sett3 = await settleDigital({ vendorId: vendorA._id, token: tokenA, subtotal: 1000 });
assert(sett3.cashFeesDeducted === 30, "Both 15s clawed back (30 total)");
assert(sett3.vendorAmount === 970, "vendorAmount = 970 (1000 - 30)");

const m1Pay = await paymentModel.findOne({ orderId: m1._id, provider: "cash" });
const m2Pay = await paymentModel.findOne({ orderId: m2._id, provider: "cash" });
assert(m1Pay.cashFeeDeducted === true && m2Pay.cashFeeDeducted === true,
  "Both cash fee records marked deducted");

// ══════════════════════════════════════════════════════════════
// 4. Whole-record carry-forward when a fee exceeds the settlement
// ══════════════════════════════════════════════════════════════
console.log("\n4. Fee larger than settlement carried forward");

// A cash order whose additionalCharges exceed the next settlement's vendorAmount
const big = await createOrder({ vendorId: vendorA._id, subtotal: 100, additionalCharges: 999 });
await recordCash(big._id, tokenA);

// Next digital order is small: goods = 100 → vendorAmount 100 < 999 fee
const sett4a = await settleDigital({ vendorId: vendorA._id, token: tokenA, subtotal: 100 });
assert(sett4a.vendorAmount === 100, "Small settlement not reduced (whole record carried forward)");
assert(sett4a.cashFeesDeducted === 0, "No partial clawback on small settlement");

const bigPayAfter = await paymentModel.findOne({ orderId: big._id, provider: "cash" });
assert(bigPayAfter.cashFeeDeducted === false, "Oversized fee record still pending");

// A later large settlement fully covers it
const sett4b = await settleDigital({ vendorId: vendorA._id, token: tokenA, subtotal: 1000 });
assert(sett4b.cashFeesDeducted === 999, "999 fee clawed back once it fits");
assert(sett4b.vendorAmount === 1, "vendorAmount floored to 1 (1000 - 999)");

const bigPayFinal = await paymentModel.findOne({ orderId: big._id, provider: "cash" });
assert(bigPayFinal.cashFeeDeducted === true, "Oversized fee record now deducted");

// ══════════════════════════════════════════════════════════════
// 5. Floor at zero — vendorAmount never negative
// ══════════════════════════════════════════════════════════════
console.log("\n5. Vendor amount floors at zero");

const exact = await createOrder({ vendorId: vendorA._id, subtotal: 50, additionalCharges: 100 });
await recordCash(exact._id, tokenA);

const sett5 = await settleDigital({ vendorId: vendorA._id, token: tokenA, subtotal: 100 });
assert(sett5.cashFeesDeducted === 100, "Fee exactly matching vendorAmount clawed back");
assert(sett5.vendorAmount === 0, "vendorAmount = 0 (floored, not negative)");

const exactPay = await paymentModel.findOne({ orderId: exact._id, provider: "cash" });
assert(exactPay.cashFeeDeducted === true, "Fully recovered fee marked deducted");

// ══════════════════════════════════════════════════════════════
// 6. Revoked cash payment is voided from outstanding pool
// ══════════════════════════════════════════════════════════════
console.log("\n6. Revoked cash payments are NOT clawed back");

const revoked = await createOrder({ vendorId: vendorA._id, subtotal: 200, additionalCharges: 15 });
await recordCash(revoked._id, tokenA);
const revokeRes = await api("POST", `/api/vendors/payments/revoke-cash/${revoked._id}`, {}, tokenA);
assert(revokeRes.status === 200, "Cash payment revoked");

const sett6 = await settleDigital({ vendorId: vendorA._id, token: tokenA, subtotal: 500 });
assert(sett6.cashFeesDeducted === 0, "No clawback from revoked cash payment");
assert(sett6.vendorAmount === 500, "vendorAmount not reduced");

// ══════════════════════════════════════════════════════════════
// 7. Vendor isolation
// ══════════════════════════════════════════════════════════════
console.log("\n7. Vendor fees never affect another vendor's settlement");

const iso = await createOrder({ vendorId: vendorB._id, subtotal: 800, additionalCharges: 15 });
await recordCash(iso._id, tokenB);

const sett7 = await settleDigital({ vendorId: vendorA._id, token: tokenA, subtotal: 400 });
assert(sett7.cashFeesDeducted === 0, "Vendor A settlement not reduced by Vendor B's fee");
assert(sett7.vendorAmount === 400, "Vendor A vendorAmount untouched");

// Consume vendor B's pending fee so later vendor-B tests start from a clean pool
const sett7b = await settleDigital({ vendorId: vendorB._id, token: tokenB, subtotal: 800 });
assert(sett7b.cashFeesDeducted === 15, "Vendor B fee clawed back by Vendor B settlement");
assert(sett7b.vendorAmount === 785, "Vendor B vendorAmount reduced by its own fee");

// ══════════════════════════════════════════════════════════════
// 8. Concurrency — a fee is deducted exactly once
// ══════════════════════════════════════════════════════════════
console.log("\n8. Concurrent settlements deduct each fee exactly once");

const conc = await createOrder({ vendorId: vendorA._id, subtotal: 100, additionalCharges: 15 });
await recordCash(conc._id, tokenA);

const c1 = await createOrder({ vendorId: vendorA._id, subtotal: 1000, additionalCharges: 15 });
const c2 = await createOrder({ vendorId: vendorA._id, subtotal: 2000, additionalCharges: 15 });
const p1 = await createDigitalOrderAndInitiate(c1, tokenA);
const p2 = await createDigitalOrderAndInitiate(c2, tokenA);

const results = await Promise.all([completeMock(p1, tokenA), completeMock(p2, tokenA)]);
assert(results.every((r) => r.status === 200), "Both concurrent completions succeeded");

const sett8a = await settlementModel.findOne({ orderId: c1._id });
const sett8b = await settlementModel.findOne({ orderId: c2._id });
const concDeducted = (Number(sett8a.cashFeesDeducted) || 0) + (Number(sett8b.cashFeesDeducted) || 0);
assert(concDeducted === 15, `Fee deducted exactly once across both settlements (got ${concDeducted})`);
assert(Number(sett8a.cashFeesDeducted) === 15 || Number(sett8b.cashFeesDeducted) === 15,
  "One settlement carried the deduction");

const concPay = await paymentModel.findOne({ orderId: conc._id, provider: "cash" });
assert(concPay.cashFeeDeducted === true, "Record deducted (not double-deducted)");

assert(sett8a.vendorAmount === 1000 - sett8a.cashFeesDeducted,
  "Settlement 8a vendorAmount reflects its own deduction");
assert(sett8b.vendorAmount === 2000 - sett8b.cashFeesDeducted,
  "Settlement 8b vendorAmount reflects its own deduction");

// ══════════════════════════════════════════════════════════════
// 9. No outstanding fees → cashFeesDeducted stored as 0
// ══════════════════════════════════════════════════════════════
console.log("\n9. Zero-fee settlement stores cashFeesDeducted = 0");

const sett9 = await settleDigital({ vendorId: vendorB._id, token: tokenB, subtotal: 700 });
assert(Number(sett9.cashFeesDeducted) === 0, "cashFeesDeducted field defaults to 0");
assert(sett9.vendorAmount === 700, "vendorAmount unchanged with no outstanding fees");

// ══════════════════════════════════════════════════════════════
// Cleanup
// ══════════════════════════════════════════════════════════════
console.log("\nCleaning up test data...");
await db.collection("vendors").deleteMany({ _id: { $in: [vendorA._id, vendorB._id] } });
await db.collection("users").deleteMany({ _id: testCustomer._id });
await db.collection("orders").deleteMany({});
await db.collection("payments").deleteMany({});
await db.collection("settlements").deleteMany({});
await db.collection("commissionconfigs").deleteMany({});
await db.collection("companyaccounts").deleteMany({});
console.log("Cleanup done");

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"=".repeat(50)}`);

server.close();
await mongoose.disconnect();
process.exit(failed > 0 ? 1 : 0);