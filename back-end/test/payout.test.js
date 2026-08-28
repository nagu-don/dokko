/**
 * Vendor payout API tests — run with: node --env-file-if-exists=.env test/payout.test.js
 *
 * Tests:
 *  1. Bank account setup via PATCH /api/vendors/payout
 *  2. GET /api/vendors/payout — masked account number
 *  3. GET /api/vendors/me — includes masked payout info
 *  4. Validation: missing required fields
 *  5. Validation: invalid payout method
 *  6. Update payout info
 *  7. Authentication: reject unauthenticated requests
 *  8. Historical settlement preservation — changing payout does not alter settlements
 */

import "dotenv/config";
import dns from "node:dns";
import http from "node:http";
import mongoose from "mongoose";
import express from "express";
import jwt from "jsonwebtoken";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

import vendorModel from "../models/vendorModel.js";
import settlementModel from "../models/settlementModel.js";
import vendorRouter from "../routes/vendorRouter.js";

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("MONGO_URI not set — cannot run payout API tests");
  process.exit(1);
}

let passed = 0;
let failed = 0;

const assert = (condition, label) => {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
};

// ── Express test app ──────────────────────────────────────────
const app = express();
app.use(express.json());
app.use("/api/vendors", vendorRouter);

let server;
let baseURL;
const testPrefix = `_test_payout_${Date.now()}`;

// ── Helpers ───────────────────────────────────────────────────
const AUTH_HEADER = (token) => ({ Authorization: `Bearer ${token}` });

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

// ──────────────────────────────────────────────────────────────
// Setup
// ──────────────────────────────────────────────────────────────
await mongoose.connect(MONGO_URI);
console.log("Connected to", mongoose.connection.name);

server = app.listen(0);
baseURL = `http://127.0.0.1:${server.address().port}`;

const db = mongoose.connection.db;

// Clean previous test data
await db.collection("vendors").deleteMany({ email: { $regex: `^${testPrefix}` } });
await db.collection("settlements").deleteMany({});

// Create test vendor
const bcrypt = (await import("bcrypt")).default;
const salt = await bcrypt.genSalt(10);
const hashedPassword = await bcrypt.hash("test123456", salt);

const testVendor = await vendorModel.create({
  name: "Test Payout Vendor",
  email: `${testPrefix}@test.com`,
  phone: String(Date.now()).slice(-10),
  password: hashedPassword,
});

const vendorToken = jwt.sign({ id: testVendor._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

// ──────────────────────────────────────────────────────────────
// 1. Bank account setup
// ──────────────────────────────────────────────────────────────
console.log("\n1. Bank account setup");

const bankSetup = await api("PATCH", "/api/vendors/payout", {
  payoutMethod: "bank",
  payoutAccountHolder: "Ram Shrestha",
  payoutBankName: "Nabil Bank",
  payoutAccountNumber: "1234567890",
}, vendorToken);

assert(bankSetup.status === 200, "Bank setup returns 200");
assert(bankSetup.data.success === true, "Bank setup returns success");
assert(bankSetup.data.data.payoutMethod === "bank", "Payout method is bank");
assert(bankSetup.data.data.payoutAccountHolder === "Ram Shrestha", "Account holder saved");
assert(bankSetup.data.data.payoutBankName === "Nabil Bank", "Bank name saved");
assert(bankSetup.data.data.payoutAccountNumber === "XXXXXXXX7890", "Account number is masked");

// ──────────────────────────────────────────────────────────────
// 2. GET payout info — masked account number
// ──────────────────────────────────────────────────────────────
console.log("\n2. GET payout info — masking");

const getPayout = await api("GET", "/api/vendors/payout", null, vendorToken);

assert(getPayout.status === 200, "GET payout returns 200");
assert(getPayout.data.success === true, "GET payout returns success");
assert(getPayout.data.data.payoutMethod === "bank", "GET payout returns method");
assert(getPayout.data.data.payoutBankName === "Nabil Bank", "GET payout returns bank name");
assert(getPayout.data.data.payoutAccountHolder === "Ram Shrestha", "GET payout returns account holder");

const getBankPayout = await api("GET", "/api/vendors/payout", null, vendorToken);
assert(getBankPayout.data.data.payoutAccountNumber === "XXXXXXXX7890", "GET payout masks bank account number");
assert(!getBankPayout.data.data.payoutAccountNumber.includes("1234"), "Masked number does not contain full account");

// ──────────────────────────────────────────────────────────────
// 3. GET /api/vendors/me includes masked payout info
// ──────────────────────────────────────────────────────────────
console.log("\n3. GET /api/vendors/me includes payout info");

const getProfile = await api("GET", "/api/vendors/me", null, vendorToken);

assert(getProfile.status === 200, "GET profile returns 200");
assert(getProfile.data.data.payoutMethod === "bank", "Profile includes payoutMethod");
assert(getProfile.data.data.payoutAccountHolder === "Ram Shrestha", "Profile includes payoutAccountHolder");
assert(getProfile.data.data.payoutBankName === "Nabil Bank", "Profile includes payoutBankName");
assert(getProfile.data.data.payoutAccountNumber === "XXXXXXXX7890", "Profile masks payoutAccountNumber");
assert(getProfile.data.data.id !== undefined, "Profile includes id");

// ──────────────────────────────────────────────────────────────
// 4. Validation: missing required fields
// ──────────────────────────────────────────────────────────────
console.log("\n4. Validation: missing required fields");

const noMethod = await api("PATCH", "/api/vendors/payout", {
  payoutAccountHolder: "Ram",
}, vendorToken);
assert(noMethod.status === 400, "Missing payout method returns 400");
assert(noMethod.data.success === false, "Missing payout method returns success=false");

const noHolder = await api("PATCH", "/api/vendors/payout", {
  payoutMethod: "bank",
  payoutBankName: "Nabil",
  payoutAccountNumber: "123",
}, vendorToken);
assert(noHolder.status === 400, "Missing account holder returns 400");

const bankNoName = await api("PATCH", "/api/vendors/payout", {
  payoutMethod: "bank",
  payoutAccountHolder: "Ram",
  payoutAccountNumber: "123",
}, vendorToken);
assert(bankNoName.status === 400, "Bank without bank name returns 400");

const bankNoNumber = await api("PATCH", "/api/vendors/payout", {
  payoutMethod: "bank",
  payoutAccountHolder: "Ram",
  payoutBankName: "Nabil",
}, vendorToken);
assert(bankNoNumber.status === 400, "Bank without account number returns 400");

// ──────────────────────────────────────────────────────────────
// 5. Validation: invalid payout method
// ──────────────────────────────────────────────────────────────
console.log("\n5. Validation: invalid payout method");

const invalidMethod = await api("PATCH", "/api/vendors/payout", {
  payoutMethod: "paypal",
  payoutAccountHolder: "Ram",
}, vendorToken);
assert(invalidMethod.status === 400, "Invalid payout method returns 400");
assert(invalidMethod.data.message.includes("payout method"), "Error mentions payout method");

// ──────────────────────────────────────────────────────────────
// 6. Update payout info
// ──────────────────────────────────────────────────────────────
console.log("\n6. Update payout info");

// First setup bank
await api("PATCH", "/api/vendors/payout", {
  payoutMethod: "bank",
  payoutAccountHolder: "Ram Shrestha",
  payoutBankName: "Nabil Bank",
  payoutAccountNumber: "1234567890",
}, vendorToken);

// Then update to different bank
const updateBank = await api("PATCH", "/api/vendors/payout", {
  payoutMethod: "bank",
  payoutAccountHolder: "Ram Shrestha Updated",
  payoutBankName: "Global IME Bank",
  payoutAccountNumber: "9876543210",
}, vendorToken);

assert(updateBank.status === 200, "Update bank returns 200");
assert(updateBank.data.data.payoutBankName === "Global IME Bank", "Bank name updated");
assert(updateBank.data.data.payoutAccountNumber === "XXXXXXXX3210", "New account number masked");
assert(updateBank.data.data.payoutAccountHolder === "Ram Shrestha Updated", "Account holder updated");

// Verify the update persisted
const verifyUpdate = await api("GET", "/api/vendors/payout", null, vendorToken);
assert(verifyUpdate.data.data.payoutBankName === "Global IME Bank", "Update persisted — bank name");
assert(verifyUpdate.data.data.payoutAccountNumber === "XXXXXXXX3210", "Update persisted — masked number");

// ──────────────────────────────────────────────────────────────
// 7. Authentication: reject unauthenticated requests
// ──────────────────────────────────────────────────────────────
console.log("\n7. Authentication");

const noAuth = await api("GET", "/api/vendors/payout", null);
assert(noAuth.status === 401 || noAuth.status === 403, "GET payout without token is rejected");

const noAuthPatch = await api("PATCH", "/api/vendors/payout", {
  payoutMethod: "bank",
  payoutAccountHolder: "Hacker",
  payoutBankName: "Fake Bank",
  payoutAccountNumber: "0000000000",
});
assert(noAuthPatch.status === 401 || noAuthPatch.status === 403, "PATCH payout without token is rejected");

// invalid token
const fakeToken = jwt.sign({ id: new mongoose.Types.ObjectId() }, "wrong-secret");
const badAuth = await api("GET", "/api/vendors/payout", null, fakeToken);
assert(badAuth.status === 401 || badAuth.status === 403, "GET payout with bad token is rejected");

// ──────────────────────────────────────────────────────────────
// 8. Historical settlement preservation
// ──────────────────────────────────────────────────────────────
console.log("\n8. Historical settlement preservation");

// Create a settlement with old payout info
const oldOrderId = new mongoose.Types.ObjectId();
const settlement = await settlementModel.create({
  orderId: oldOrderId,
  vendorId: testVendor._id,
  customerPaymentAmount: 225,
  goodsAmount: 160,
  deliveryAmount: 50,
  additionalChargesAmount: 15,
  companyAmount: 65,
  vendorAmount: 160,
  payoutDestination: {
    method: "bank",
    bankName: "Nabil Bank",
    accountNumber: "1234567890",
    accountHolder: "Ram Shrestha",
  },
  payoutMethod: "bank",
});

assert(settlement.payoutDestination.bankName === "Nabil Bank", "Settlement created with old bank");

// Now change the vendor's payout info
await api("PATCH", "/api/vendors/payout", {
  payoutMethod: "bank",
  payoutAccountHolder: "Ram Shrestha",
  payoutBankName: "Global IME Bank",
  payoutAccountNumber: "9876543210",
}, vendorToken);

// Verify the settlement still has the old payout info
const unchangedSettlement = await settlementModel.findById(settlement._id);
assert(unchangedSettlement.payoutDestination.method === "bank", "Settlement payout method unchanged");
assert(unchangedSettlement.payoutDestination.bankName === "Nabil Bank", "Settlement bank name unchanged");
assert(unchangedSettlement.payoutDestination.accountNumber === "1234567890", "Settlement account number unchanged");
assert(unchangedSettlement.payoutDestination.accountHolder === "Ram Shrestha", "Settlement account holder unchanged");
assert(unchangedSettlement.payoutMethod === "bank", "Settlement top-level payoutMethod unchanged");

// Verify the vendor's info did change
const updatedVendor = await vendorModel.findById(testVendor._id);
assert(updatedVendor.payoutMethod === "bank", "Vendor payoutMethod changed to bank");
assert(updatedVendor.payoutBankName === "Global IME Bank", "Vendor bank name updated");
assert(updatedVendor.payoutAccountNumber === "9876543210", "Vendor account number updated");

// ──────────────────────────────────────────────────────────────
// 9. Bank account number: only last 4 chars shown
// ──────────────────────────────────────────────────────────────
console.log("\n9. Account number masking edge cases");

// Short account number
await api("PATCH", "/api/vendors/payout", {
  payoutMethod: "bank",
  payoutAccountHolder: "Test",
  payoutBankName: "Test Bank",
  payoutAccountNumber: "1234",
}, vendorToken);

const shortMask = await api("GET", "/api/vendors/payout", null, vendorToken);
assert(shortMask.data.data.payoutAccountNumber === "XXXXXXXX1234", "Short account number — last 4 shown");

// 5-digit account number
await api("PATCH", "/api/vendors/payout", {
  payoutMethod: "bank",
  payoutAccountHolder: "Test",
  payoutBankName: "Test Bank",
  payoutAccountNumber: "12345",
}, vendorToken);

const fiveDigitMask = await api("GET", "/api/vendors/payout", null, vendorToken);
assert(fiveDigitMask.data.data.payoutAccountNumber === "XXXXXXXX2345", "5-digit account number — last 4 shown");

// ──────────────────────────────────────────────────────────────
// Cleanup
// ──────────────────────────────────────────────────────────────
console.log("\nCleaning up test data...");
await db.collection("vendors").deleteMany({ email: { $regex: `^${testPrefix}` } });
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
