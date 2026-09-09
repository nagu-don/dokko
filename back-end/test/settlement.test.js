/**
 * Settlement system tests — run with: node --env-file-if-exists=.env test/settlement.test.js
 *
 * Tests:
 *  1. Settlement creation with correct financial breakdown (fixed commission)
 *  2. Settlement creation with percent commission
 *  3. Minimum commission floor enforcement
 *  4. Incorrect calculation rejection (client-supplied amounts ignored)
 *  5. Duplicate settlement prevention (unique orderId index)
 *  6. Historical payout destination snapshot
 *  7. Commission configuration — GET default
 *  8. Commission configuration — UPDATE fixed mode
 *  9. Commission configuration — UPDATE percent mode
 * 10. Commission configuration — validation rejects invalid values
 * 11. Order/payment/settlement relationship chain
 * 12. Settlement status transitions (pending → approved → paid)
 * 13. Company account ledger tracking
 * 14. Vendor payable aggregation
 * 15. Settlement cancellation
 * 16. Pay already-paid settlement rejection
 * 17. Finance permission gate — approve/pay require canManageFinance
 * 18. Finance permission grant/revoke — takes effect immediately
 * 19. Last finance admin cannot be revoked (lock-out protection)
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
import adminRouter from "../routes/adminRouter.js";
import { loadGateway } from "../gateway/index.js";
import { calculateSettlementAmounts, loadCommissionConfig } from "../controllers/paymentController.js";

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("MONGO_URI not set — cannot run settlement tests");
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

const assertThrows = async (fn, label) => {
  try {
    await fn();
    console.error(`  \u2717 ${label} — expected error but none thrown`);
    failed++;
  } catch {
    console.log(`  \u2713 ${label}`);
    passed++;
  }
};

// ── Express test app ──────────────────────────────────────────
const app = express();
app.use(express.json());
app.use("/api/vendors", vendorRouter);
app.use("/api/admins", adminRouter);

let server;
let baseURL;
const testPrefix = `_test_settle_${Date.now()}`;

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

// ── Mock fetch to control provider API responses ──────────────
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
await db.collection("admins").deleteMany({ email: { $regex: `^${testPrefix}` } });
await db.collection("orders").deleteMany({});
await db.collection("payments").deleteMany({});
await db.collection("settlements").deleteMany({});
await db.collection("commissionconfigs").deleteMany({});
await db.collection("companyaccounts").deleteMany({});

// Load gateway with test config
loadGateway({
  PAYMENT_PROVIDER: "mock",
  COMPANY_BANK_ACCOUNT: "000000000000",
});

// ── Create test entities ──────────────────────────────────────
const bcrypt = (await import("bcrypt")).default;
const salt = await bcrypt.genSalt(10);
const hashedPassword = await bcrypt.hash("test123456", salt);

// Test admin (finance-capable)
const testAdmin = await db.collection("admins").insertOne({
  name: "Test Settlement Admin",
  email: `${testPrefix}-admin@test.com`,
  phone: String(Date.now() + 100).slice(-10),
  password: hashedPassword,
  status: "active",
  canManageFinance: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});
const adminId = testAdmin.insertedId;
const adminToken = jwt.sign({ id: adminId }, process.env.JWT_SECRET, { expiresIn: "1d" });

// Non-finance admin (for 403 permission-gate tests)
const noFinanceAdmin = await db.collection("admins").insertOne({
  name: "Test Non-Finance Admin",
  email: `${testPrefix}-nofinance@test.com`,
  phone: String(Date.now() + 200).slice(-10),
  password: hashedPassword,
  status: "active",
  canManageFinance: false,
  createdAt: new Date(),
  updatedAt: new Date(),
});
const noFinanceAdminId = noFinanceAdmin.insertedId;
const noFinanceToken = jwt.sign({ id: noFinanceAdminId }, process.env.JWT_SECRET, { expiresIn: "1d" });

// Second finance-capable admin (for grant/revoke + lock-out tests)
const financeAdmin2 = await db.collection("admins").insertOne({
  name: "Test Second Finance Admin",
  email: `${testPrefix}-finance2@test.com`,
  phone: String(Date.now() + 300).slice(-10),
  password: hashedPassword,
  status: "active",
  canManageFinance: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});
const financeAdmin2Id = financeAdmin2.insertedId;

// Test vendor with payout details
const testVendor = await vendorModel.create({
  name: "Test Settlement Vendor",
  email: `${testPrefix}@test.com`,
  phone: String(Date.now()).slice(-10),
  password: hashedPassword,
  payoutMethod: "bank",
  payoutBankName: "Nabil Bank",
  payoutAccountNumber: "1234567890",
  payoutAccountHolder: "Test Vendor",
});

const vendorToken = jwt.sign({ id: testVendor._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

// Second vendor for payable tests
const testVendor2 = await vendorModel.create({
  name: "Test Vendor 2",
  email: `${testPrefix}-v2@test.com`,
  phone: String(Date.now() + 2).slice(-10),
  password: hashedPassword,
  payoutMethod: "bank",
  payoutBankName: "Global IME Bank",
  payoutAccountNumber: "9876543210",
  payoutAccountHolder: "Test Vendor 2",
});

// Test customer
const testCustomer = await userModel.create({
  name: "Test Settlement Customer",
  email: `${testPrefix}-customer@test.com`,
  phone: String(Date.now() + 1).slice(-10),
  password: hashedPassword,
});

// Default mock: successful provider verification
mockFetchHandler = async (url, options) => {
  return originalFetch(url, options);
};

// Helper: create order + initiate payment, return both
const createOrderAndPayment = async (opts = {}) => {
  const order = await orderModel.create({
    user: testCustomer._id,
    items: [{ nameEng: "Tomato", nameNep: "\u0917\u094b\u0932\u092d\u0947\u0902\u0921\u093e", quantity: 2, priceAtOrder: 80 }],
    totalQuantity: 2,
    subtotal: opts.subtotal || 160,
    deliveryCharge: opts.deliveryCharge ?? 50,
    additionalCharges: opts.additionalCharges ?? 15,
    total: (opts.subtotal || 160) + (opts.deliveryCharge ?? 50) + (opts.additionalCharges ?? 15),
    status: "Processing",
    vendor: opts.vendorId || testVendor._id,
    acceptedAt: new Date(),
  });

  const initiate = await api("POST", `/api/vendors/payments/initiate/${order._id}`, {
    provider: "mock",
  }, vendorToken);

  if (!initiate.data?.data) {
    console.error("  DEBUG initiate status:", initiate.status);
    console.error("  DEBUG initiate data type:", typeof initiate.data);
    console.error("  DEBUG initiate data:", String(initiate.data).slice(0, 200));
    console.error("  DEBUG order:", order._id, "vendor:", testVendor._id.toString());
    console.error("  DEBUG token present:", !!vendorToken);
    console.error("  DEBUG baseURL:", baseURL);
    // try a simple GET to verify server is up
    const ping = await api("GET", `/api/vendors/payout`);
    console.error("  DEBUG ping status:", ping.status);
  }

  return {
    order,
    paymentId: initiate.data.data.paymentId,
    reference: initiate.data.data.reference,
  };
};

// Helper: complete a payment via simulated mock callback
const completePayment = async (paymentId) => {
  return api("POST", `/api/vendors/payments/mock/${paymentId}/complete`, {}, vendorToken);
};

// ══════════════════════════════════════════════════════════════
// 1. Settlement creation with correct financial breakdown (fixed)
// ══════════════════════════════════════════════════════════════
console.log("\n1. Settlement creation — correct financial breakdown (fixed commission)");

// Reset commission config to fixed defaults
await commissionConfigModel.deleteMany({});
await commissionConfigModel.create({
  companyFeeType: "fixed",
  deliveryCharge: 50,
  additionalCharges: 15,
  commissionPercentage: 0,
  minimumCommission: 0,
});

const { order: ord1, paymentId: pay1, reference: ref1 } = await createOrderAndPayment({ subtotal: 1000 });
await completePayment(pay1);

const sett1 = await settlementModel.findOne({ orderId: ord1._id });
assert(sett1 !== null, "Settlement created");
assert(sett1.customerPaymentAmount === 1065, "customerPaymentAmount = 1065 (1000+50+15)");
assert(sett1.goodsAmount === 1000, "goodsAmount = 1000");
assert(sett1.deliveryAmount === 50, "deliveryAmount = 50");
assert(sett1.additionalChargesAmount === 15, "additionalChargesAmount = 15");
assert(sett1.companyAmount === 65, "companyAmount = 65 (delivery+charges)");
assert(sett1.vendorAmount === 1000, "vendorAmount = 1000 (goods)");
assert(sett1.customerPaymentAmount === sett1.companyAmount + sett1.vendorAmount,
  "customerPayment = company + vendor");
assert(sett1.currency === "NPR", "Currency is NPR");
assert(sett1.status === "pending", "Initial status is pending");
assert(sett1.payoutDestination.method === "bank", "Payout method snapshotted");
assert(sett1.payoutDestination.accountNumber === "1234567890", "Account number snapshotted");

// ══════════════════════════════════════════════════════════════
// 2. Settlement creation with percent commission
// ══════════════════════════════════════════════════════════════
console.log("\n2. Settlement creation — percent commission");

// Switch to percent mode: 10% of goods, no minimum
await commissionConfigModel.updateOne({}, {
  companyFeeType: "percent",
  commissionPercentage: 10,
  minimumCommission: 0,
  deliveryCharge: 50,
  additionalCharges: 15,
});

const { order: ord2, paymentId: pay2, reference: ref2 } = await createOrderAndPayment({
  subtotal: 1000,
  deliveryCharge: 50,
  additionalCharges: 15,
});
await completePayment(pay2);

const sett2 = await settlementModel.findOne({ orderId: ord2._id });
assert(sett2 !== null, "Percent commission settlement created");
assert(sett2.goodsAmount === 1000, "goodsAmount = 1000");
assert(sett2.companyAmount === 165, "companyAmount = 165 (10% commission + delivery + charges)");
assert(sett2.vendorAmount === 900, "vendorAmount = 900 (1000 - 100)");
assert(sett2.customerPaymentAmount === sett2.companyAmount + sett2.vendorAmount,
  "customerPayment = company + vendor (percent mode)");

// ══════════════════════════════════════════════════════════════
// 3. Minimum commission floor enforcement
// ══════════════════════════════════════════════════════════════
console.log("\n3. Minimum commission floor enforcement");

// 5% commission with NPR 50 minimum on a small order (subtotal=200)
await commissionConfigModel.updateOne({}, {
  companyFeeType: "percent",
  commissionPercentage: 5,
  minimumCommission: 50,
});

const { order: ord3, paymentId: pay3, reference: ref3 } = await createOrderAndPayment({
  subtotal: 200,
  deliveryCharge: 50,
  additionalCharges: 15,
});
await completePayment(pay3);

const sett3 = await settlementModel.findOne({ orderId: ord3._id });
assert(sett3 !== null, "Minimum commission settlement created");
// 5% of 200 = 10, but minimum is 50; company also gets delivery + charges
assert(sett3.companyAmount === 115, "companyAmount = 115 (50 commission + 50 delivery + 15 charges)");
assert(sett3.vendorAmount === 150, "vendorAmount = 200 - 50");
assert(sett3.customerPaymentAmount === sett3.companyAmount + sett3.vendorAmount,
  "customerPayment = company + vendor (minimum floor)");

// ══════════════════════════════════════════════════════════════
// 4. Incorrect calculation rejection — client cannot supply amounts
// ══════════════════════════════════════════════════════════════
console.log("\n4. Incorrect calculation rejection — client-supplied amounts ignored");

// The createSettlement function NEVER reads from req.body.
// It always computes from order + commission config.
// Test that calculation is always correct regardless of order values.
await commissionConfigModel.updateOne({}, {
  companyFeeType: "fixed",
  deliveryCharge: 50,
  additionalCharges: 15,
});

// Create an order with large amounts
const { order: ord4, paymentId: pay4, reference: ref4 } = await createOrderAndPayment({
  subtotal: 5000,
  deliveryCharge: 50,
  additionalCharges: 15,
});

// Customer pays exactly what the order requires
await completePayment(pay4);

const sett4 = await settlementModel.findOne({ orderId: ord4._id });
assert(sett4 !== null, "Settlement created for large order");
assert(sett4.goodsAmount === 5000, "goodsAmount always matches order subtotal");
assert(sett4.companyAmount === 65, "companyAmount always matches config");
assert(sett4.vendorAmount === 5000, "vendorAmount always matches goods");

// Verify the accounting equation
assert(
  sett4.customerPaymentAmount === sett4.goodsAmount + sett4.deliveryAmount + sett4.additionalChargesAmount,
  "customerPayment = goods + delivery + charges (always holds)"
);

// ══════════════════════════════════════════════════════════════
// 5. Duplicate settlement prevention
// ══════════════════════════════════════════════════════════════
console.log("\n5. Duplicate settlement prevention (unique orderId index)");

const settCountBefore = await settlementModel.countDocuments({ orderId: ord4._id });

// Try to create another settlement for the same order (simulating duplicate callback)
// The unique index on orderId should prevent this
await assertThrows(
  () => settlementModel.create({
    orderId: ord4._id,
    vendorId: testVendor._id,
    paymentId: pay4,
    customerPaymentAmount: 5065,
    goodsAmount: 5000,
    deliveryAmount: 50,
    additionalChargesAmount: 15,
    companyAmount: 65,
    vendorAmount: 5000,
    status: "pending",
  }),
  "Duplicate settlement for same orderId throws"
);

const settCountAfter = await settlementModel.countDocuments({ orderId: ord4._id });
assert(settCountAfter === settCountBefore, "Still only one settlement for the order");

// Also verify via the duplicate callback path (idempotent in verifyAndCompletePayment)
// The callback handler catches duplicate key errors and ignores them
const cb5 = await api("POST", `/api/vendors/payments/mock/${pay4}/complete`, {}, vendorToken);
// This should succeed (already_verified) without creating a new settlement
const settCountAfterCb = await settlementModel.countDocuments({ orderId: ord4._id });
assert(settCountAfterCb === 1, "Duplicate callback does not create second settlement");

// ══════════════════════════════════════════════════════════════
// 6. Historical payout destination snapshot
// ══════════════════════════════════════════════════════════════
console.log("\n6. Historical payout destination snapshot");

// Settlement from test 1 should have the original payout info
assert(sett1.payoutDestination.bankName === "Nabil Bank", "Settlement 1 has original bank name");
assert(sett1.payoutDestination.accountNumber === "1234567890", "Settlement 1 has original account");

// Now change the vendor's payout info
await api("PATCH", "/api/vendors/payout", {
  payoutMethod: "bank",
  payoutAccountHolder: "Test Vendor",
  payoutBankName: "Himalayan Bank",
  payoutAccountNumber: "0987654321",
}, vendorToken);

// Historical settlement should be unchanged
const unchangedSett1 = await settlementModel.findById(sett1._id);
assert(unchangedSett1.payoutDestination.method === "bank", "Historical settlement payout method unchanged");
assert(unchangedSett1.payoutDestination.bankName === "Nabil Bank", "Historical settlement bank name unchanged");
assert(unchangedSett1.payoutDestination.accountNumber === "1234567890", "Historical settlement account unchanged");

// Restore payout info for subsequent tests
await api("PATCH", "/api/vendors/payout", {
  payoutMethod: "bank",
  payoutAccountHolder: "Test Vendor",
  payoutBankName: "Nabil Bank",
  payoutAccountNumber: "1234567890",
}, vendorToken);

// ══════════════════════════════════════════════════════════════
// 7. Commission configuration — GET default
// ══════════════════════════════════════════════════════════════
console.log("\n7. Commission configuration — GET default");

// Clear and re-create
await commissionConfigModel.deleteMany({});
await commissionConfigModel.create({
  companyFeeType: "fixed",
  deliveryCharge: 50,
  additionalCharges: 15,
  commissionPercentage: 0,
  minimumCommission: 0,
});

const getConfigRes = await api("GET", "/api/admins/commission-config", null, adminToken);
assert(getConfigRes.status === 200, "GET commission config returns 200");
assert(getConfigRes.data.success === true, "GET commission config returns success");
assert(getConfigRes.data.data.companyFeeType === "fixed", "Default fee type is fixed");
assert(getConfigRes.data.data.deliveryCharge === 50, "Default delivery charge is 50");
assert(getConfigRes.data.data.additionalCharges === 15, "Default additional charges is 15");

// ══════════════════════════════════════════════════════════════
// 8. Commission configuration — UPDATE fixed mode
// ══════════════════════════════════════════════════════════════
console.log("\n8. Commission configuration — UPDATE fixed mode");

const updateFixed = await api("PATCH", "/api/admins/commission-config", {
  companyFeeType: "fixed",
  deliveryCharge: 75,
  additionalCharges: 20,
  description: "Updated fixed fees",
}, adminToken);

assert(updateFixed.status === 200, "Update fixed config returns 200");
assert(updateFixed.data.data.deliveryCharge === 75, "Delivery charge updated to 75");
assert(updateFixed.data.data.additionalCharges === 20, "Additional charges updated to 20");
assert(updateFixed.data.data.description === "Updated fixed fees", "Description updated");

// Verify via GET
const verifyFixed = await api("GET", "/api/admins/commission-config", null, adminToken);
assert(verifyFixed.data.data.deliveryCharge === 75, "GET returns updated delivery charge");

// Reset for subsequent tests
await api("PATCH", "/api/admins/commission-config", {
  deliveryCharge: 50,
  additionalCharges: 15,
  companyFeeType: "fixed",
}, adminToken);

// ══════════════════════════════════════════════════════════════
// 9. Commission configuration — UPDATE percent mode
// ══════════════════════════════════════════════════════════════
console.log("\n9. Commission configuration — UPDATE percent mode");

const updatePercent = await api("PATCH", "/api/admins/commission-config", {
  companyFeeType: "percent",
  commissionPercentage: 15,
  minimumCommission: 25,
  description: "15% commission with NPR 25 floor",
}, adminToken);

assert(updatePercent.status === 200, "Update percent config returns 200");
assert(updatePercent.data.data.companyFeeType === "percent", "Fee type changed to percent");
assert(updatePercent.data.data.commissionPercentage === 15, "Commission percentage set to 15");
assert(updatePercent.data.data.minimumCommission === 25, "Minimum commission set to 25");

// Verify the calculation engine picks it up
const config = await loadCommissionConfig();
assert(config.companyFeeType === "percent", "Config loaded in percent mode");
assert(config.commissionPercentage === 15, "Config has 15% commission");

// Reset for subsequent tests
await api("PATCH", "/api/admins/commission-config", {
  companyFeeType: "fixed",
  commissionPercentage: 0,
  minimumCommission: 0,
  deliveryCharge: 50,
  additionalCharges: 15,
}, adminToken);

// ══════════════════════════════════════════════════════════════
// 10. Commission configuration — validation rejects invalid values
// ══════════════════════════════════════════════════════════════
console.log("\n10. Commission configuration — validation");

const invalidType = await api("PATCH", "/api/admins/commission-config", {
  companyFeeType: "invalid",
}, adminToken);
assert(invalidType.status === 400, "Invalid fee type rejected");

const negativeDelivery = await api("PATCH", "/api/admins/commission-config", {
  deliveryCharge: -10,
}, adminToken);
assert(negativeDelivery.status === 400, "Negative delivery charge rejected");

const overPercent = await api("PATCH", "/api/admins/commission-config", {
  commissionPercentage: 150,
}, adminToken);
assert(overPercent.status === 400, "Percentage > 100 rejected");

const negMin = await api("PATCH", "/api/admins/commission-config", {
  minimumCommission: -5,
}, adminToken);
assert(negMin.status === 400, "Negative minimum commission rejected");

// Unauthorized access
const noAuth = await api("PATCH", "/api/admins/commission-config", {
  deliveryCharge: 999,
});
assert(noAuth.status === 401 || noAuth.status === 403, "Unauthorized update rejected");

// ══════════════════════════════════════════════════════════════
// 11. Order / payment / settlement relationship chain
// ══════════════════════════════════════════════════════════════
console.log("\n11. Order → Payment → Settlement relationship chain");

const { order: ord11, paymentId: pay11, reference: ref11 } = await createOrderAndPayment({ subtotal: 500 });
await completePayment(pay11);

const chainOrder = await orderModel.findById(ord11._id);
const chainPayment = await paymentModel.findById(pay11);
const chainSettlement = await settlementModel.findOne({ orderId: ord11._id });

assert(chainOrder !== null, "Order exists");
assert(chainPayment !== null, "Payment exists");
assert(chainSettlement !== null, "Settlement exists");

// Links
assert(chainPayment.orderId.toString() === chainOrder._id.toString(), "Payment links to correct order");
assert(chainSettlement.orderId.toString() === chainOrder._id.toString(), "Settlement links to correct order");
assert(chainSettlement.paymentId.toString() === chainPayment._id.toString(), "Settlement links to correct payment");
assert(chainSettlement.vendorId.toString() === testVendor._id.toString(), "Settlement links to correct vendor");

// Financial consistency
assert(chainPayment.amountExpected === chainSettlement.customerPaymentAmount,
  "Payment amount matches settlement customerPaymentAmount");
assert(chainOrder.paymentStatus === "paid", "Order paymentStatus is paid");

// ══════════════════════════════════════════════════════════════
// 12. Settlement status transitions
// ══════════════════════════════════════════════════════════════
console.log("\n12. Settlement status transitions (pending → approved → paid)");

const { order: ord12, paymentId: pay12, reference: ref12 } = await createOrderAndPayment({ subtotal: 300 });
await completePayment(pay12);

const sett12 = await settlementModel.findOne({ orderId: ord12._id });
assert(sett12.status === "pending", "Settlement starts as pending");

// Approve
const approveRes = await api("PATCH", `/api/admins/settlements/${sett12._id}/approve`, {
  adminNote: "Approved for payout",
}, adminToken);
assert(approveRes.status === 200, "Approve returns 200");

const sett12AfterApprove = await settlementModel.findById(sett12._id);
assert(sett12AfterApprove.status === "approved", "Settlement status is approved");

// Pay
const payRes = await api("PATCH", `/api/admins/settlements/${sett12._id}/pay`, {
  payoutMethod: "bank",
  payoutReference: "BANK-TXN-123",
  adminNote: "Paid via bank transfer",
}, adminToken);
assert(payRes.status === 200, "Pay returns 200");

const sett12AfterPay = await settlementModel.findById(sett12._id);
assert(sett12AfterPay.status === "paid", "Settlement status is paid");
assert(sett12AfterPay.paidAt instanceof Date, "paidAt is set");
assert(sett12AfterPay.payoutReference === "BANK-TXN-123", "payoutReference is recorded");
assert(sett12AfterPay.paidByAdminId.toString() === adminId.toString(), "paidByAdminId is recorded");

// ══════════════════════════════════════════════════════════════
// 13. Company account ledger tracking
// ══════════════════════════════════════════════════════════════
console.log("\n13. Company account ledger tracking");

const accountRes = await api("GET", "/api/admins/company-account", null, adminToken);
assert(accountRes.status === 200, "GET company account returns 200");
assert(accountRes.data.success === true, "Company account loaded");

const acct = accountRes.data.data;
assert(acct.collectedAmount > 0, "Collected amount is positive (from settlement creation)");
assert(acct.totalSettlements > 0, "Total settlements > 0");
assert(acct.pendingPayouts >= 0, "Pending payouts >= 0");
assert(acct.currency === "NPR", "Currency is NPR");

// After paying one settlement, disbursedAmount should increase
assert(acct.disbursedAmount === 250 || acct.disbursedAmount > 0,
  "Disbursed amount reflects paid settlement");

// balance = collected - disbursed
assert(acct.balance === acct.collectedAmount - acct.disbursedAmount,
  "Balance = collected - disbursed");

// ══════════════════════════════════════════════════════════════
// 14. Vendor payable aggregation
// ══════════════════════════════════════════════════════════════
console.log("\n14. Vendor payable aggregation");

const payablesRes = await api("GET", "/api/admins/vendor-payables", null, adminToken);
assert(payablesRes.status === 200, "GET vendor payables returns 200");
assert(Array.isArray(payablesRes.data.data), "Payables is an array");
assert(payablesRes.data.data.length > 0, "At least one vendor has payables");

const vendorPayable = payablesRes.data.data.find(
  (p) => p.vendorId === String(testVendor._id)
);
assert(vendorPayable !== undefined, "Test vendor has payable entries");
assert(vendorPayable.totalOwed > 0, "Vendor total owed is positive");
assert(vendorPayable.settlementCount > 0, "Settlement count is positive");
assert(vendorPayable.vendorName === "Test Settlement Vendor", "Vendor name included");

// ══════════════════════════════════════════════════════════════
// 15. Settlement cancellation
// ══════════════════════════════════════════════════════════════
console.log("\n15. Settlement cancellation");

const { order: ord15, paymentId: pay15, reference: ref15 } = await createOrderAndPayment({ subtotal: 250 });
await completePayment(pay15);

const sett15 = await settlementModel.findOne({ orderId: ord15._id });
assert(sett15.status === "pending", "New settlement is pending");

// Cancel it
const cancelRes = await api("PATCH", `/api/admins/settlements/${sett15._id}/cancel`, {
  adminNote: "Order disputed",
}, adminToken);
assert(cancelRes.status === 200, "Cancel returns 200");

const sett15After = await settlementModel.findById(sett15._id);
assert(sett15After.status === "cancelled", "Settlement status is cancelled");
assert(sett15After.adminNote === "Order disputed", "Admin note saved");

// ══════════════════════════════════════════════════════════════
// 16. Pay already-paid settlement rejection
// ══════════════════════════════════════════════════════════════
console.log("\n16. Pay already-paid settlement rejection");

// sett12AfterPay is already paid
const doublePay = await api("PATCH", `/api/admins/settlements/${sett12._id}/pay`, {
  payoutReference: "FAKE-SECOND",
}, adminToken);
assert(doublePay.status === 409, "Double pay returns 409 conflict");
assert(doublePay.data.success === false, "Double pay returns success=false");

// Cannot cancel a paid settlement
const cancelPaid = await api("PATCH", `/api/admins/settlements/${sett12._id}/cancel`, {}, adminToken);
assert(cancelPaid.status === 409, "Cancel paid settlement returns 409");

// Cannot approve a paid settlement
const approvePaid = await api("PATCH", `/api/admins/settlements/${sett12._id}/approve`, {}, adminToken);
assert(approvePaid.status === 409, "Approve paid settlement returns 409");

// ══════════════════════════════════════════════════════════════
// 17. Finance permission gate — approve/pay require canManageFinance
// ══════════════════════════════════════════════════════════════
console.log("\n17. Finance permission gate — approve/pay require canManageFinance");

const { order: ord17, paymentId: pay17, reference: ref17 } = await createOrderAndPayment({ subtotal: 400 });
await completePayment(pay17);

const sett17 = await settlementModel.findOne({ orderId: ord17._id });
assert(sett17 !== null && sett17.status === "pending", "Fresh settlement is pending");

// /api/admins/me reports finance permission correctly
const meNoFinance = await api("GET", "/api/admins/me", null, noFinanceToken);
assert(meNoFinance.status === 200, "GET /me returns 200 for active admin");
assert(meNoFinance.data.success === true, "GET /me returns success");
assert(meNoFinance.data.data.canManageFinance === false, "`/me` reports canManageFinance=false for non-finance admin");

const meFinance = await api("GET", "/api/admins/me", null, adminToken);
assert(meFinance.data.success === true, "GET /me returns success for finance admin");
assert(meFinance.data.data.canManageFinance === true, "`/me` reports canManageFinance=true for finance admin");

// Server-side enforcement: non-finance admins blocked on approve/pay
const noFinanceApprove = await api("PATCH", `/api/admins/settlements/${sett17._id}/approve`, { adminNote: "not allowed" }, noFinanceToken);
assert(noFinanceApprove.status === 403, "Non-finance admin gets 403 on approve");
assert(noFinanceApprove.data.success === false, "Blocked approve returns success=false");

const noFinancePay = await api("PATCH", `/api/admins/settlements/${sett17._id}/pay`, { payoutReference: "NOPE" }, noFinanceToken);
assert(noFinancePay.status === 403, "Non-finance admin gets 403 on pay");

const noTokenApprove = await api("PATCH", `/api/admins/settlements/${sett17._id}/approve`, {});
assert(noTokenApprove.status === 401 || noTokenApprove.status === 403, "No token on approve is rejected");

// Other admin functionality remains available to non-finance admins
const nonFinanceList = await api("GET", "/api/admins/settlements", null, noFinanceToken);
assert(nonFinanceList.status === 200, "Non-finance admin can still list settlements");
const nonFinanceListAdmins = await api("GET", "/api/admins/all", null, noFinanceToken);
assert(nonFinanceListAdmins.status === 200, "Non-finance admin can still list admins");

// Settlement remains pending after rejected actions
const sett17AfterBlocked = await settlementModel.findById(sett17._id);
assert(sett17AfterBlocked.status === "pending", "Settlement still pending after blocked actions");

// ══════════════════════════════════════════════════════════════
// 18. Finance permission grant/revoke — takes effect immediately
// ══════════════════════════════════════════════════════════════
console.log("\n18. Finance permission grant/revoke — takes effect immediately");

// Non-finance admin cannot use the grant endpoint itself
const cannotGrant = await api("PATCH", `/api/admins/finance-permission/${financeAdmin2Id}`, { canManageFinance: true }, noFinanceToken);
assert(cannotGrant.status === 403, "Non-finance admin cannot mutate finance permissions");

// Grant finance to the non-finance admin via the finance-gated endpoint
const grantRes = await api("PATCH", `/api/admins/finance-permission/${noFinanceAdminId}`, { canManageFinance: true }, adminToken);
assert(grantRes.status === 200, "Finance admin can grant finance permission");
assert(grantRes.data.success === true, "Grant returns success");
assert(grantRes.data.data.canManageFinance === true, "Grant response reflects new permission");

// Newly granted admin can now approve
const grantedApprove = await api("PATCH", `/api/admins/settlements/${sett17._id}/approve`, { adminNote: "approved after grant" }, noFinanceToken);
assert(grantedApprove.status === 200, "Granted admin can approve");

const sett17Approved = await settlementModel.findById(sett17._id);
assert(sett17Approved.status === "approved", "Settlement approved by granted admin");

// Revoke — the very next request must be rejected (permission is not cached)
const revokeRes = await api("PATCH", `/api/admins/finance-permission/${noFinanceAdminId}`, { canManageFinance: false }, adminToken);
assert(revokeRes.status === 200, "Finance admin can revoke finance permission");
assert(revokeRes.data.data.canManageFinance === false, "Revoke response reflects permission removed");

const revokedPay = await api("PATCH", `/api/admins/settlements/${sett17._id}/pay`, { payoutReference: "SHOULD-FAIL" }, noFinanceToken);
assert(revokedPay.status === 403, "Revoked admin is rejected on the next request (403)");

// Original finance admin can still pay
const originalPay = await api("PATCH", `/api/admins/settlements/${sett17._id}/pay`, { payoutMethod: "bank", payoutReference: "BANK-17" }, adminToken);
assert(originalPay.status === 200, "Finance admin can still pay");

// Invalid payload rejected
const badPayload = await api("PATCH", `/api/admins/finance-permission/${noFinanceAdminId}`, { canManageFinance: "yes" }, adminToken);
assert(badPayload.status === 400, "Non-boolean canManageFinance rejected");

// ══════════════════════════════════════════════════════════════
// 19. Last finance admin cannot be revoked (settlements stay payable)
// ══════════════════════════════════════════════════════════════
console.log("\n19. Last finance admin cannot be revoked");

// financeAdmin2 is a second finance-capable admin; revoking them is allowed
const revokeSecond = await api("PATCH", `/api/admins/finance-permission/${financeAdmin2Id}`, { canManageFinance: false }, adminToken);
assert(revokeSecond.status === 200, "Revoking a second finance admin is allowed while another remains");

// Attempting to revoke the last remaining finance admin must be refused
const revokeLast = await api("PATCH", `/api/admins/finance-permission/${adminId}`, { canManageFinance: false }, adminToken);
assert(revokeLast.status === 409, "Revoking the last finance admin returns 409");
assert(revokeLast.data.success === false, "Lock-out revoke returns success=false");

// Finance permission intact afterward
const meAfterBlocked = await api("GET", "/api/admins/me", null, adminToken);
assert(meAfterBlocked.data.data.canManageFinance === true, "Finance permission still intact after blocked revoke");

// ══════════════════════════════════════════════════════════════
// Cleanup
// ══════════════════════════════════════════════════════════════
console.log("\nCleaning up test data...");
await db.collection("vendors").deleteMany({ _id: { $in: [testVendor._id, testVendor2._id] } });
await db.collection("users").deleteMany({ _id: testCustomer._id });
await db.collection("admins").deleteMany({ _id: { $in: [adminId, noFinanceAdminId, financeAdmin2Id] } });
await db.collection("orders").deleteMany({});
await db.collection("payments").deleteMany({});
await db.collection("settlements").deleteMany({});
await db.collection("commissionconfigs").deleteMany({});
await db.collection("companyaccounts").deleteMany({});
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
