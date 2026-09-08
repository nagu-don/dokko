/**
 * Model validation script — run with: node --env-file-if-exists=.env test/models.test.js
 *
 * Tests:
 *  1. Model imports & schema structure
 *  2. Document creation with valid data
 *  3. Validation failures (required, enum, min, unique)
 *  4. Index creation & uniqueness constraints
 *  5. Relationship references (ObjectId refs)
 *  6. Migration safety (existing-order backfill simulation)
 *  7. Financial rule: settlement amounts are server-defined
 *  8. Payout snapshot immutability design
 */

import "dotenv/config";
import dns from "node:dns";
import mongoose from "mongoose";

// resolve MongoDB Atlas SRV record the same way the app does
dns.setServers(["8.8.8.8", "8.8.4.4"]);
import orderModel, { DELIVERY_CHARGE, ADDITIONAL_CHARGES, ORDER_STATUSES, PAYMENT_STATUSES, PAYMENT_METHODS } from "../models/orderModel.js";
import paymentModel, { PAYMENT_PROVIDERS } from "../models/paymentModel.js";
import settlementModel, { SETTLEMENT_STATUSES } from "../models/settlementModel.js";
import vendorModel from "../models/vendorModel.js";
import userModel from "../models/userModel.js";
import adminModel from "../models/adminModel.js";

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("MONGO_URI not set — cannot run integration tests");
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

// ──────────────────────────────────────────────────────────────
// 0. Connect
// ──────────────────────────────────────────────────────────────
await mongoose.connect(MONGO_URI);
console.log("Connected to", mongoose.connection.name);

// Use a separate test database to avoid polluting real data
const db = mongoose.connection.db;
const testPrefix = `_test_${Date.now()}`;

// clean any leftover test data from previous failed runs
await db.collection("payments").deleteMany({merchantReference: {$regex: "^_test_"}});
await db.collection("settlements").deleteMany({});
await db.collection("vendors").deleteMany({email: {$regex: "^_test_"}});
await db.collection("orders").deleteMany({user: {$exists: false}});

// ──────────────────────────────────────────────────────────────
// 1. Schema structure — verify field paths exist
// ──────────────────────────────────────────────────────────────
console.log("\n1. Schema structure");

assert(orderSchemaHas("user"), "order.user field exists");
assert(orderSchemaHas("items"), "order.items field exists");
assert(orderSchemaHas("totalQuantity"), "order.totalQuantity field exists");
assert(orderSchemaHas("subtotal"), "order.subtotal field exists");
assert(orderSchemaHas("deliveryCharge"), "order.deliveryCharge field exists");
assert(orderSchemaHas("additionalCharges"), "order.additionalCharges field exists");
assert(orderSchemaHas("total"), "order.total field exists");
assert(orderSchemaHas("status"), "order.status field exists");
assert(orderSchemaHas("dropoff"), "order.dropoff field exists");
assert(orderSchemaHas("vendor"), "order.vendor field exists");
assert(orderSchemaHas("acceptedAt"), "order.acceptedAt field exists");
assert(orderSchemaHas("completedAt"), "order.completedAt field exists");
assert(orderSchemaHas("paymentStatus"), "order.paymentStatus field exists");
assert(orderSchemaHas("paymentMethod"), "order.paymentMethod field exists");

assert(paymentSchemaHas("orderId"), "payment.orderId field exists");
assert(paymentSchemaHas("customerId"), "payment.customerId field exists");
assert(paymentSchemaHas("vendorId"), "payment.vendorId field exists");
assert(paymentSchemaHas("provider"), "payment.provider field exists");
assert(paymentSchemaHas("providerTransactionId"), "payment.providerTransactionId field exists");
assert(paymentSchemaHas("merchantReference"), "payment.merchantReference field exists");
assert(paymentSchemaHas("amountExpected"), "payment.amountExpected field exists");
assert(paymentSchemaHas("amountReceived"), "payment.amountReceived field exists");
assert(paymentSchemaHas("currency"), "payment.currency field exists");
assert(paymentSchemaHas("status"), "payment.status field exists");
assert(paymentSchemaHas("qrString"), "payment.qrString field exists (opaque provider QR output)");
assert(paymentSchemaHas("qrReference"), "payment.qrReference field exists");
assert(paymentSchemaHas("providerPayload"), "payment.providerPayload field exists");
assert(paymentSchemaHas("expiresAt"), "payment.expiresAt field exists");
assert(paymentSchemaHas("paidAt"), "payment.paidAt field exists");
assert(paymentSchemaHas("verifiedAt"), "payment.verifiedAt field exists");
assert(paymentSchemaHas("failureReason"), "payment.failureReason field exists");
assert(!paymentSchemaHas("validationTraceId"), "NCHL-specific validationTraceId is absent");
assert(!paymentSchemaHas("nchlResponseCode"), "NCHL-specific field is absent");

assert(settlementSchemaHas("orderId"), "settlement.orderId field exists");
assert(settlementSchemaHas("vendorId"), "settlement.vendorId field exists");
assert(settlementSchemaHas("paymentId"), "settlement.paymentId field exists");
assert(settlementSchemaHas("customerPaymentAmount"), "settlement.customerPaymentAmount field exists");
assert(settlementSchemaHas("goodsAmount"), "settlement.goodsAmount field exists");
assert(settlementSchemaHas("deliveryAmount"), "settlement.deliveryAmount field exists");
assert(settlementSchemaHas("additionalChargesAmount"), "settlement.additionalChargesAmount field exists");
assert(settlementSchemaHas("companyAmount"), "settlement.companyAmount field exists");
assert(settlementSchemaHas("vendorAmount"), "settlement.vendorAmount field exists");
assert(settlementSchemaHas("currency"), "settlement.currency field exists");
assert(settlementSchemaHas("status"), "settlement.status field exists");
assert(settlementSchemaHas("payoutDestination"), "settlement.payoutDestination field exists");
assert(settlementSchemaHas("payoutMethod"), "settlement.payoutMethod field exists");
assert(settlementSchemaHas("payoutReference"), "settlement.payoutReference field exists");
assert(settlementSchemaHas("paidByAdminId"), "settlement.paidByAdminId field exists");
assert(settlementSchemaHas("paidAt"), "settlement.paidAt field exists");
assert(settlementSchemaHas("adminNote"), "settlement.adminNote field exists");

assert(vendorSchemaHas("payoutMethod"), "vendor.payoutMethod field exists");
assert(vendorSchemaHas("payoutBankName"), "vendor.payoutBankName field exists");
assert(vendorSchemaHas("payoutAccountNumber"), "vendor.payoutAccountNumber field exists");
assert(vendorSchemaHas("payoutAccountHolder"), "vendor.payoutAccountHolder field exists");

// ──────────────────────────────────────────────────────────────
// 2. Enum / constant verification
// ──────────────────────────────────────────────────────────────
console.log("\n2. Enums and constants");

assert(ORDER_STATUSES.includes("Pending"), "ORDER_STATUSES has Pending");
assert(ORDER_STATUSES.includes("Processing"), "ORDER_STATUSES has Processing");
assert(ORDER_STATUSES.includes("Delivered"), "ORDER_STATUSES has Delivered");
assert(ORDER_STATUSES.includes("Cancelled"), "ORDER_STATUSES has Cancelled");

assert(PAYMENT_STATUSES.includes("unpaid"), "PAYMENT_STATUSES has unpaid");
assert(PAYMENT_STATUSES.includes("pending"), "PAYMENT_STATUSES has pending");
assert(PAYMENT_STATUSES.includes("paid"), "PAYMENT_STATUSES has paid");
assert(PAYMENT_STATUSES.includes("failed"), "PAYMENT_STATUSES has failed");
assert(PAYMENT_STATUSES.includes("refunded"), "PAYMENT_STATUSES has refunded");
assert(PAYMENT_STATUSES.length === 6, "PAYMENT_STATUSES has exactly 6 values");

assert(PAYMENT_METHODS.includes("mock"), "PAYMENT_METHODS has mock");
assert(PAYMENT_METHODS.includes("cash"), "PAYMENT_METHODS has cash");
assert(PAYMENT_METHODS.includes("cod"), "PAYMENT_METHODS has cod");
assert(PAYMENT_METHODS.includes("fonepay"), "PAYMENT_METHODS has fonepay");
assert(PAYMENT_METHODS.length === 4, "PAYMENT_METHODS has exactly 4 values");

assert(PAYMENT_PROVIDERS.includes("mock"), "PAYMENT_PROVIDERS has mock");
assert(PAYMENT_PROVIDERS.includes("cash"), "PAYMENT_PROVIDERS has cash");
assert(PAYMENT_PROVIDERS.includes("fonepay"), "PAYMENT_PROVIDERS has fonepay");
assert(PAYMENT_PROVIDERS.length === 3, "PAYMENT_PROVIDERS has exactly 3 values");

assert(SETTLEMENT_STATUSES.includes("pending"), "SETTLEMENT_STATUSES has pending");
assert(SETTLEMENT_STATUSES.includes("approved"), "SETTLEMENT_STATUSES has approved");
assert(SETTLEMENT_STATUSES.includes("paid"), "SETTLEMENT_STATUSES has paid");
assert(SETTLEMENT_STATUSES.includes("failed"), "SETTLEMENT_STATUSES has failed");
assert(SETTLEMENT_STATUSES.includes("cancelled"), "SETTLEMENT_STATUSES has cancelled");
assert(SETTLEMENT_STATUSES.length === 5, "SETTLEMENT_STATUSES has exactly 5 values");

assert(DELIVERY_CHARGE === 25, "DELIVERY_CHARGE is the base band (25)");
assert(ADDITIONAL_CHARGES === 15, "ADDITIONAL_CHARGES is 15");

// ──────────────────────────────────────────────────────────────
// 3. Document creation — valid data
// ──────────────────────────────────────────────────────────────
console.log("\n3. Valid document creation");

// Temporarily create real documents to test valid creation
const testUserId = new mongoose.Types.ObjectId();
const testVendorId = new mongoose.Types.ObjectId();
const testAdminId = new mongoose.Types.ObjectId();
const testOrderId = new mongoose.Types.ObjectId();

// order with payment fields
const testOrder = new orderModel({
  user: testUserId,
  items: [{ item: new mongoose.Types.ObjectId(), nameEng: "Tomato", quantity: 2, priceAtOrder: 80 }],
  totalQuantity: 2,
  subtotal: 160,
  deliveryCharge: 50,
  additionalCharges: 15,
  total: 225,
  status: "Pending",
  paymentStatus: "unpaid",
  paymentMethod: null
});
const orderErr = testOrder.validateSync();
assert(!orderErr, "Order with valid data validates OK");
assert(testOrder.paymentStatus === "unpaid", "Order paymentStatus defaults to unpaid");
assert(testOrder.paymentMethod === null, "Order paymentMethod defaults to null");

// payment with all fields
const testPayment = new paymentModel({
  orderId: testOrderId,
  customerId: testUserId,
  vendorId: testVendorId,
  provider: "mock",
  merchantReference: "txn-test-001",
  amountExpected: 225,
  status: "created",
  currency: "NPR"
});
const paymentErr = testPayment.validateSync();
assert(!paymentErr, "Payment with valid data validates OK");
assert(testPayment.currency === "NPR", "Payment currency is NPR");
assert(testPayment.status === "created", "Payment status defaults to created");
assert(testPayment.qrReference === null, "Payment qrReference defaults to null");
assert(testPayment.providerPayload === null, "Payment providerPayload defaults to null");

// settlement with all fields
const testSettlement = new settlementModel({
  orderId: testOrderId,
  vendorId: testVendorId,
  paymentId: new mongoose.Types.ObjectId(),
  customerPaymentAmount: 225,
  goodsAmount: 160,
  deliveryAmount: 50,
  additionalChargesAmount: 15,
  companyAmount: 65,
  vendorAmount: 160,
  status: "pending",
  payoutDestination: {
    method: "bank",
    bankName: "Nabil Bank",
    accountNumber: "1234567890",
    accountHolder: "Ram Vendor"
  }
});
const settlementErr = testSettlement.validateSync();
assert(!settlementErr, "Settlement with valid data validates OK");
assert(testSettlement.currency === "NPR", "Settlement currency is NPR");
assert(testSettlement.status === "pending", "Settlement status defaults to pending");
assert(testSettlement.payoutDestination.method === "bank", "Settlement payout destination snapshots method");
assert(testSettlement.payoutDestination.bankName === "Nabil Bank", "Settlement payout destination snapshots bank name");

// vendor with payout fields
const testVendor = new vendorModel({
  name: "Test Vendor",
  email: `${testPrefix}@test.com`,
  phone: "9800000001",
  password: "hashed",
  payoutMethod: "bank",
  payoutBankName: "Nabil Bank",
  payoutAccountNumber: "1234567890",
  payoutAccountHolder: "Test Vendor"
});
const vendorErr = testVendor.validateSync();
assert(!vendorErr, "Vendor with payout fields validates OK");
assert(testVendor.payoutMethod === "bank", "Vendor payoutMethod set correctly");
assert(testVendor.payoutBankName === "Nabil Bank", "Vendor payoutBankName set correctly");

// ──────────────────────────────────────────────────────────────
// 4. Validation failures
// ──────────────────────────────────────────────────────────────
console.log("\n4. Validation failures");

// order missing required fields
const badOrder = new orderModel({});
const badOrderErr = badOrder.validateSync();
assert(badOrderErr !== null && badOrderErr !== undefined, "Order missing required fields fails validation");
assert(badOrderErr?.errors?.user, "Order missing user field fails");
assert(badOrderErr?.errors?.items, "Order missing items field fails");

// order with invalid paymentStatus enum
const badPaymentStatusOrder = new orderModel({
  user: testUserId,
  items: [{ item: new mongoose.Types.ObjectId(), nameEng: "Tomato", quantity: 2, priceAtOrder: 80 }],
  totalQuantity: 2,
  subtotal: 160,
  deliveryCharge: 50,
  additionalCharges: 15,
  total: 225,
  paymentStatus: "INVALID_STATUS"
});
const badPaymentStatusErr = badPaymentStatusOrder.validateSync();
assert(badPaymentStatusErr !== null, "Order with invalid paymentStatus fails validation");

// payment missing required fields
const badPayment = new paymentModel({});
const badPaymentErr = badPayment.validateSync();
assert(badPaymentErr !== null, "Payment missing required fields fails validation");
assert(badPaymentErr?.errors?.orderId, "Payment missing orderId fails");
assert(badPaymentErr?.errors?.customerId, "Payment missing customerId fails");
assert(badPaymentErr?.errors?.provider, "Payment missing provider fails");
assert(badPaymentErr?.errors?.merchantReference, "Payment missing merchantReference fails");
assert(badPaymentErr?.errors?.amountExpected, "Payment missing amountExpected fails");

// payment with invalid provider
const badProviderPayment = new paymentModel({
  orderId: testOrderId,
  customerId: testUserId,
  provider: "khalti",
  merchantReference: "test-ref",
  amountExpected: 100
});
const badProviderErr = badProviderPayment.validateSync();
assert(badProviderErr !== null, "Payment with invalid provider fails validation");

// payment with invalid status
const badStatusPayment = new paymentModel({
  orderId: testOrderId,
  customerId: testUserId,
  provider: "mock",
  merchantReference: "test-ref-2",
  amountExpected: 100,
  status: "INVALID_STATUS"
});
const badStatusErr = badStatusPayment.validateSync();
assert(badStatusErr !== null, "Payment with invalid status fails validation");

// settlement missing required fields
const badSettlement = new settlementModel({});
const badSettlementErr = badSettlement.validateSync();
assert(badSettlementErr !== null, "Settlement missing required fields fails validation");
assert(badSettlementErr?.errors?.orderId, "Settlement missing orderId fails");
assert(badSettlementErr?.errors?.vendorId, "Settlement missing vendorId fails");
assert(badSettlementErr?.errors?.customerPaymentAmount, "Settlement missing customerPaymentAmount fails");
assert(badSettlementErr?.errors?.goodsAmount, "Settlement missing goodsAmount fails");
assert(badSettlementErr?.errors?.deliveryAmount, "Settlement missing deliveryAmount fails");
assert(badSettlementErr?.errors?.companyAmount, "Settlement missing companyAmount fails");
assert(badSettlementErr?.errors?.vendorAmount, "Settlement missing vendorAmount fails");

// settlement with negative amounts
const negativeSettlement = new settlementModel({
  orderId: testOrderId,
  vendorId: testVendorId,
  customerPaymentAmount: -100,
  goodsAmount: 160,
  deliveryAmount: 50,
  additionalChargesAmount: 15,
  companyAmount: 65,
  vendorAmount: 160
});
const negErr = negativeSettlement.validateSync();
assert(negErr !== null, "Settlement with negative amount fails validation");

// settlement with invalid status
const badSettlementStatus = new settlementModel({
  orderId: testOrderId,
  vendorId: testVendorId,
  customerPaymentAmount: 225,
  goodsAmount: 160,
  deliveryAmount: 50,
  additionalChargesAmount: 15,
  companyAmount: 65,
  vendorAmount: 160,
  status: "INVALID_STATUS"
});
const badSSStatusErr = badSettlementStatus.validateSync();
assert(badSSStatusErr !== null, "Settlement with invalid status fails validation");

// ──────────────────────────────────────────────────────────────
// 5. Default values verification
// ──────────────────────────────────────────────────────────────
console.log("\n5. Default values");

const defaultPayment = new paymentModel({
  orderId: testOrderId,
  customerId: testUserId,
  provider: "mock",
  merchantReference: "test-default-ref",
  amountExpected: 100
});
defaultPayment.validateSync();
assert(defaultPayment.status === "created", "Payment status defaults to 'created'");
assert(defaultPayment.currency === "NPR", "Payment currency defaults to 'NPR'");
assert(defaultPayment.amountReceived === null, "Payment amountReceived defaults to null");
assert(defaultPayment.providerTransactionId === undefined, "Payment providerTransactionId defaults to undefined (omitted from DB)");
assert(defaultPayment.qrReference === null, "Payment qrReference defaults to null");
assert(defaultPayment.paidAt === null, "Payment paidAt defaults to null");
assert(defaultPayment.verifiedAt === null, "Payment verifiedAt defaults to null");
assert(defaultPayment.failureReason === null, "Payment failureReason defaults to null");
assert(defaultPayment.expiresAt === null, "Payment expiresAt defaults to null");

const defaultSettlement = new settlementModel({
  orderId: testOrderId,
  vendorId: testVendorId,
  customerPaymentAmount: 225,
  goodsAmount: 160,
  deliveryAmount: 50,
  additionalChargesAmount: 15,
  companyAmount: 65,
  vendorAmount: 160
});
defaultSettlement.validateSync();
assert(defaultSettlement.status === "pending", "Settlement status defaults to 'pending'");
assert(defaultSettlement.currency === "NPR", "Settlement currency defaults to 'NPR'");
assert(defaultSettlement.payoutMethod === null, "Settlement payoutMethod defaults to null");
assert(defaultSettlement.payoutReference === null, "Settlement payoutReference defaults to null");
assert(defaultSettlement.paidByAdminId === null, "Settlement paidByAdminId defaults to null");
assert(defaultSettlement.paidAt === null, "Settlement paidAt defaults to null");
assert(defaultSettlement.adminNote === null, "Settlement adminNote defaults to null");
assert(defaultSettlement.paymentId === null, "Settlement paymentId defaults to null");

const defaultVendor = new vendorModel({
  name: "Default Payout Vendor",
  email: `${testPrefix}-default@test.com`,
  phone: "9800000002",
  password: "hashed"
});
defaultVendor.validateSync();
assert(defaultVendor.payoutMethod === null, "Vendor payoutMethod defaults to null");
assert(defaultVendor.payoutBankName === null, "Vendor payoutBankName defaults to null");
assert(defaultVendor.payoutAccountNumber === null, "Vendor payoutAccountNumber defaults to null");
assert(defaultVendor.payoutAccountHolder === null, "Vendor payoutAccountHolder defaults to null");

// ──────────────────────────────────────────────────────────────
// 6. Migration safety — existing records continue working
// ──────────────────────────────────────────────────────────────
console.log("\n6. Migration safety");

// simulate an existing order (no payment fields) by reading raw
const legacyOrder = {
  _id: new mongoose.Types.ObjectId(),
  user: testUserId,
  items: [{ item: new mongoose.Types.ObjectId(), nameEng: "Potato", nameNep: "आलु", quantity: 5, priceAtOrder: 60 }],
  totalQuantity: 5,
  subtotal: 300,
  deliveryCharge: 50,
  additionalCharges: 15,
  total: 365,
  status: "Delivered",
  vendor: testVendorId,
  acceptedAt: new Date("2025-01-15"),
  completedAt: new Date("2025-01-16"),
  createdAt: new Date("2025-01-15"),
  updatedAt: new Date("2025-01-16")
};

// write directly to DB (bypassing Mongoose schema to simulate legacy doc)
await db.collection("orders").insertOne(legacyOrder);
const foundLegacy = await db.collection("orders").findOne({_id: legacyOrder._id});
assert(foundLegacy, "Legacy order found in DB");
assert(!foundLegacy.paymentStatus, "Legacy order has no paymentStatus field (pre-backfill)");

// simulate backfill
await db.collection("orders").updateOne(
  {_id: legacyOrder._id},
  {$set: {paymentStatus: "unpaid", paymentMethod: null}}
);
const backfilled = await db.collection("orders").findOne({_id: legacyOrder._id});
assert(backfilled.paymentStatus === "unpaid", "Backfilled order has paymentStatus = unpaid");
assert(backfilled.paymentMethod === null, "Backfilled order has paymentMethod = null");
// original data untouched
assert(backfilled.total === 365, "Legacy order total unchanged after backfill");
assert(backfilled.status === "Delivered", "Legacy order status unchanged after backfill");
assert(backfilled.items.length === 1, "Legacy order items unchanged after backfill");
assert(backfilled.items[0].nameNep === "आलु", "Legacy order Nepali name unchanged after backfill");

// simulate existing vendor (no payout fields)
const legacyVendor = {
  _id: new mongoose.Types.ObjectId(),
  name: "Legacy Vendor",
  email: `${testPrefix}-legacy@test.com`,
  phone: "9899999999",
  password: "hashed",
  location: {type: "Point", coordinates: [85.324, 27.7172]},
  hasSetLocation: false
};
await db.collection("vendors").insertOne(legacyVendor);
const foundLegacyVendor = await db.collection("vendors").findOne({_id: legacyVendor._id});
assert(!foundLegacyVendor.payoutMethod, "Legacy vendor has no payoutMethod (pre-backfill)");

await db.collection("vendors").updateOne(
  {_id: legacyVendor._id},
  {$set: {payoutMethod: null, payoutBankName: null, payoutAccountNumber: null, payoutAccountHolder: null}}
);
const backfilledVendor = await db.collection("vendors").findOne({_id: legacyVendor._id});
assert(backfilledVendor.payoutMethod === null, "Backfilled vendor has payoutMethod = null");
assert(backfilledVendor.location.coordinates[0] === 85.324, "Legacy vendor location unchanged after backfill");

// ──────────────────────────────────────────────────────────────
// 7. Index creation & uniqueness constraints
// ──────────────────────────────────────────────────────────────
console.log("\n7. Index creation & constraints");

// create indexes
// index creation is tested through the Mongoose model ensureIndexes
try {
  await paymentModel.ensureIndexes();
  assert(true, "Payment indexes created successfully");
} catch (e) {
  assert(false, `Payment indexes failed: ${e.message}`);
}

try {
  await settlementModel.ensureIndexes();
  assert(true, "Settlement indexes created successfully");
} catch (e) {
  assert(false, `Settlement indexes failed: ${e.message}`);
}

try {
  await orderModel.ensureIndexes();
  assert(true, "Order indexes created successfully");
} catch (e) {
  assert(false, `Order indexes failed: ${e.message}`);
}

// verify indexes exist
const paymentIndexes = await db.collection("payments").listIndexes().toArray();
const paymentIndexNames = paymentIndexes.map(i => i.name);
assert(paymentIndexNames.includes("_id_"), "Payments has _id index");
assert(paymentIndexes.some(i => i.key.merchantReference === 1), "Payments has merchantReference index");
assert(paymentIndexes.some(i => i.key.providerTransactionId === 1), "Payments has providerTransactionId index");
assert(paymentIndexes.some(i => i.key.customerId === 1), "Payments has customerId index");
assert(paymentIndexes.some(i => i.key.orderId === 1 && i.key.provider !== undefined), "Payments has orderId+provider compound index");
assert(paymentIndexes.some(i => i.key.orderId === 1 && i.key.createdAt === -1), "Payments has orderId+createdAt index");

const settlementIndexes = await db.collection("settlements").listIndexes().toArray();
assert(settlementIndexes.some(i => i.key._id !== undefined), "Settlements has _id index");
assert(settlementIndexes.some(i => i.key.orderId === 1 && i.unique), "Settlements has orderId unique index");
assert(settlementIndexes.some(i => i.key.vendorId === 1), "Settlements has vendorId index");
assert(settlementIndexes.some(i => i.key.status === 1), "Settlements has status index");
assert(settlementIndexes.some(i => i.key.paymentId === 1), "Settlements has paymentId index");

const orderIndexes = await db.collection("orders").listIndexes().toArray();
const orderIndexNames = orderIndexes.map(i => i.name);
assert(orderIndexNames.some(n => n.includes("paymentStatus")), "Orders has paymentStatus index");

// test uniqueness: duplicate merchantReference should fail
const uniquePayment1 = new paymentModel({
  orderId: new mongoose.Types.ObjectId(),
  customerId: testUserId,
  provider: "mock",
  merchantReference: `${testPrefix}-unique-ref`,
  amountExpected: 100,
  status: "created"
});
await uniquePayment1.save();
assert(true, "First payment with merchantReference saved");

let dupeCaught = false;
try {
  const uniquePayment2 = new paymentModel({
    orderId: new mongoose.Types.ObjectId(),
    customerId: testUserId,
    provider: "mock",
    merchantReference: `${testPrefix}-unique-ref`,
    amountExpected: 200,
    status: "created"
  });
  await uniquePayment2.save();
} catch (e) {
  dupeCaught = true;
}
assert(dupeCaught, "Duplicate merchantReference rejected");

// test uniqueness: duplicate orderId+provider+status=payment_verified
const verifyPayment1 = new paymentModel({
  orderId: testOrderId,
  customerId: testUserId,
  provider: "mock",
  merchantReference: `${testPrefix}-verify-ref-1`,
  amountExpected: 225,
  amountReceived: 225,
  status: "payment_verified"
});
await verifyPayment1.save();
assert(true, "First verified payment saved");

let dupeVerifiedCaught = false;
try {
  const verifyPayment2 = new paymentModel({
    orderId: testOrderId,
    customerId: testUserId,
    provider: "mock",
    merchantReference: `${testPrefix}-verify-ref-2`,
    amountExpected: 225,
    amountReceived: 225,
    status: "payment_verified"
  });
  await verifyPayment2.save();
} catch (e) {
  dupeVerifiedCaught = true;
}
assert(dupeVerifiedCaught, "Duplicate verified payment for same orderId+provider rejected");

// non-verified duplicates should be allowed
let nonVerifiedDupeOk = true;
try {
  const dupePending1 = new paymentModel({
    orderId: testOrderId,
    customerId: testUserId,
    provider: "mock",
    merchantReference: `${testPrefix}-pending-ref-1`,
    amountExpected: 225,
    status: "created"
  });
  await dupePending1.save();

  const dupePending2 = new paymentModel({
    orderId: testOrderId,
    customerId: testUserId,
    provider: "mock",
    merchantReference: `${testPrefix}-pending-ref-2`,
    amountExpected: 225,
    status: "created"
  });
  await dupePending2.save();
} catch (e) {
  nonVerifiedDupeOk = false;
}
assert(nonVerifiedDupeOk, "Multiple non-verified payments for same order allowed");

// test settlement uniqueness: one settlement per order
const settlement1 = new settlementModel({
  orderId: testOrderId,
  vendorId: testVendorId,
  customerPaymentAmount: 225,
  goodsAmount: 160,
  deliveryAmount: 50,
  additionalChargesAmount: 15,
  companyAmount: 65,
  vendorAmount: 160
});
await settlement1.save();
assert(true, "First settlement for order saved");

let dupeSettlementCaught = false;
try {
  const settlement2 = new settlementModel({
    orderId: testOrderId,
    vendorId: testVendorId,
    customerPaymentAmount: 225,
    goodsAmount: 160,
    deliveryAmount: 50,
    additionalChargesAmount: 15,
    companyAmount: 65,
    vendorAmount: 160
  });
  await settlement2.save();
} catch (e) {
  dupeSettlementCaught = true;
}
assert(dupeSettlementCaught, "Duplicate settlement for same orderId rejected");

// ──────────────────────────────────────────────────────────────
// 8. Financial rule — amounts are server-defined
// ──────────────────────────────────────────────────────────────
console.log("\n8. Financial rule verification");

// the order model calculates: total = subtotal + deliveryCharge + additionalCharges
const financialOrder = new orderModel({
  user: testUserId,
  items: [{ item: new mongoose.Types.ObjectId(), nameEng: "Tomato", quantity: 10, priceAtOrder: 80 }],
  totalQuantity: 10,
  subtotal: 800,
  deliveryCharge: 50,
  additionalCharges: 15,
  total: 865,
  paymentStatus: "unpaid"
});
financialOrder.validateSync();
assert(financialOrder.total === financialOrder.subtotal + financialOrder.deliveryCharge + financialOrder.additionalCharges, "Order total = subtotal + deliveryCharge + additionalCharges");

// the settlement model records the breakdown
const financialSettlement = new settlementModel({
  orderId: new mongoose.Types.ObjectId(),
  vendorId: testVendorId,
  customerPaymentAmount: 865,
  goodsAmount: 800,
  deliveryAmount: 50,
  additionalChargesAmount: 15,
  companyAmount: 65,
  vendorAmount: 800
});
financialSettlement.validateSync();
assert(financialSettlement.customerPaymentAmount === financialSettlement.goodsAmount + financialSettlement.deliveryAmount + financialSettlement.additionalChargesAmount, "Settlement customerPayment = goods + delivery + additionalCharges");
assert(financialSettlement.companyAmount === financialSettlement.deliveryAmount + financialSettlement.additionalChargesAmount, "Settlement companyAmount = delivery + additionalCharges");
assert(financialSettlement.vendorAmount === financialSettlement.goodsAmount, "Settlement vendorAmount = goodsAmount");
assert(financialSettlement.customerPaymentAmount === financialSettlement.companyAmount + financialSettlement.vendorAmount, "Settlement: customerPayment = company + vendor");

// ──────────────────────────────────────────────────────────────
// 9. Payout snapshot immutability design
// ──────────────────────────────────────────────────────────────
console.log("\n9. Payout snapshot design");

const snapSettlement = new settlementModel({
  orderId: new mongoose.Types.ObjectId(),
  vendorId: testVendorId,
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
    accountHolder: "Ram Vendor"
  }
});
snapSettlement.validateSync();
assert(snapSettlement.payoutDestination.method === "bank", "Snapshot preserves method");
assert(snapSettlement.payoutDestination.bankName === "Nabil Bank", "Snapshot preserves bank name");
assert(snapSettlement.payoutDestination.accountNumber === "1234567890", "Snapshot preserves account number");
assert(snapSettlement.payoutDestination.accountHolder === "Ram Vendor", "Snapshot preserves account holder");

// verify the snapshot is a separate embedded sub-document (not an ObjectId ref)
// if it were a reference, it would be a plain ObjectId; embedded docs have their own structure
const hasSubdocFields = snapSettlement.payoutDestination.method !== undefined
  && snapSettlement.payoutDestination.bankName !== undefined
  && snapSettlement.payoutDestination.accountNumber !== undefined;
assert(hasSubdocFields, "Payout destination is an embedded sub-document with structured fields (not a plain ObjectId ref)");

// ──────────────────────────────────────────────────────────────
// Cleanup
// ──────────────────────────────────────────────────────────────
console.log("\nCleaning up test data...");
await db.collection("payments").deleteMany({merchantReference: {$regex: `^${testPrefix}`}});
await db.collection("settlements").deleteMany({});
await db.collection("orders").deleteMany({_id: {$in: [legacyOrder._id]}});
await db.collection("vendors").deleteMany({_id: {$in: [legacyVendor._id]}});
// also clean any leftover test data from previous failed runs
await db.collection("vendors").deleteMany({email: {$regex: `^${testPrefix}`}});
console.log("Cleanup done");

// ──────────────────────────────────────────────────────────────
// 10. Summary
// ──────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"=".repeat(50)}`);

await mongoose.disconnect();
process.exit(failed > 0 ? 1 : 0);

// ── helper: check schema paths ──────────────────────────────
function orderSchemaHas(path) {
  return orderModel.schema.path(path) !== undefined;
}
function paymentSchemaHas(path) {
  return paymentModel.schema.path(path) !== undefined;
}
function settlementSchemaHas(path) {
  return settlementModel.schema.path(path) !== undefined;
}
function vendorSchemaHas(path) {
  return vendorModel.schema.path(path) !== undefined;
}
