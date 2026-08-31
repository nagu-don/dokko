/**
 * Provider-neutral contract tests — run with: node test/providerContract.test.js
 *
 * Pure unit tests (no database required).
 *
 * Verifies that the DOKKO payment-core contract is provider-neutral:
 *  1. normaliseProviderResult() emits exactly the generic contract fields
 *  2. Provider-specific extras never leak into top-level contract fields —
 *     they are folded into `metadata`
 *  3. Legacy generic aliases (reference → merchantReference,
 *     transactionId → providerTransactionId) are mapped
 *  4. Defaults fill omitted fields without overriding provided ones
 *  5. Results (including metadata) are frozen
 *  6. Non-object input is rejected
 *  7. The public gateway re-exports the contract surface
 */

import { normaliseProviderResult, PaymentProvider } from "../gateway/index.js";

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

const assertThrows = (fn, label) => {
  try {
    fn();
    console.error(`  \u2717 ${label} — expected error but none thrown`);
    failed++;
  } catch {
    console.log(`  \u2713 ${label}`);
    passed++;
  }
};

const assertAsyncThrows = async (fn, label) => {
  try {
    await fn();
    console.error(`  \u2717 ${label} — expected error but none thrown`);
    failed++;
  } catch {
    console.log(`  \u2713 ${label}`);
    passed++;
  }
};

// ──────────────────────────────────────────────────────────────
// 1. Normalisation emits exactly the generic contract fields
// ──────────────────────────────────────────────────────────────
console.log("\n1. Generic contract vocabulary");

const GENERIC_FIELDS = [
  "provider",
  "flow",
  "merchantReference",
  "providerReference",
  "providerTransactionId",
  "amountExpected",
  "amountReceived",
  "status",
  "expiresAt",
  "metadata",
];

const full = normaliseProviderResult({
  provider: "mock",
  flow: "mock",
  merchantReference: "DKO-REF-1",
  providerReference: "PREF-1",
  providerTransactionId: "TXN-1",
  amountExpected: 100,
  amountReceived: 100,
  status: "completed",
  expiresAt: "2026-01-01T00:00:00.000Z",
});

assert(
  JSON.stringify(Object.keys(full).sort()) === JSON.stringify([...GENERIC_FIELDS].sort()),
  "Normalised result exposes exactly the generic contract fields"
);
assert(full.provider === "mock", "provider preserved");
assert(full.flow === "mock", "flow preserved");
assert(full.merchantReference === "DKO-REF-1", "merchantReference preserved");
assert(full.providerReference === "PREF-1", "providerReference preserved");
assert(full.providerTransactionId === "TXN-1", "providerTransactionId preserved");
assert(full.amountExpected === 100, "amountExpected preserved");
assert(full.amountReceived === 100, "amountReceived preserved");
assert(full.status === "completed", "status preserved");
assert(full.expiresAt === "2026-01-01T00:00:00.000Z", "expiresAt preserved");

// ──────────────────────────────────────────────────────────────
// 2. Provider-specific extras fold into metadata — never top level
// ──────────────────────────────────────────────────────────────
console.log("\n2. Provider-specific extras stay out of the generic contract");

// Simulate an NCHL-style payload leaking vendor field names.
const nchlStyle = normaliseProviderResult({
  provider: "nepalpay",
  flow: "qr",
  qrString: "MATMSG:...",
  validationTraceId: "NCHL-TRACE-1",
  nchlResponseCode: "00",
});

assert(nchlStyle.qrString === undefined, "qrString is not a top-level contract field");
assert(nchlStyle.validationTraceId === undefined, "validationTraceId is not a top-level contract field");
assert(nchlStyle.nchlResponseCode === undefined, "nchlResponseCode is not a top-level contract field");
assert(nchlStyle.metadata.qrString === "MATMSG:...", "qrString folds into metadata");
assert(nchlStyle.metadata.validationTraceId === "NCHL-TRACE-1", "validationTraceId folds into metadata");
assert(nchlStyle.metadata.nchlResponseCode === "00", "nchlResponseCode folds into metadata");
assert(nchlStyle.provider === "nepalpay" && nchlStyle.flow === "qr", "Generic fields still normalised");

// Explicit `metadata` wins and is merged, and other extras still fold in.
const withMetadata = normaliseProviderResult({
  provider: "mock",
  mockReference: "MOCK-1",
  metadata: { note: "explicit-metadata" },
});
assert(withMetadata.metadata.note === "explicit-metadata", "Explicit metadata preserved");
assert(withMetadata.metadata.mockReference === "MOCK-1", "Top-level extras still fold into metadata");

// ──────────────────────────────────────────────────────────────
// 3. Legacy generic aliases map into canonical fields
// ──────────────────────────────────────────────────────────────
console.log("\n3. Legacy aliases");

const aliased = normaliseProviderResult({
  provider: "mock",
  reference: "DKO-LEGACY",
  transactionId: "TXN-LEGACY",
});
assert(aliased.merchantReference === "DKO-LEGACY", "reference → merchantReference");
assert(aliased.providerTransactionId === "TXN-LEGACY", "transactionId → providerTransactionId");
assert(aliased.reference === undefined, "Legacy 'reference' not exposed at top level");
assert(aliased.transactionId === undefined, "Legacy 'transactionId' not exposed at top level");
assert(aliased.metadata.reference === undefined, "Legacy 'reference' not duplicated into metadata");
assert(aliased.metadata.transactionId === undefined, "Legacy 'transactionId' not duplicated into metadata");

// Canonical field takes precedence when both forms are present.
const both = normaliseProviderResult({ provider: "mock", merchantReference: "CANONICAL", reference: "LEGACY" });
assert(both.merchantReference === "CANONICAL", "Canonical merchantReference wins over legacy alias");

// ──────────────────────────────────────────────────────────────
// 4. Defaults fill omitted fields without overriding provided ones
// ──────────────────────────────────────────────────────────────
console.log("\n4. Defaults");

const withDefaults = normaliseProviderResult(
  { provider: "mock", amountReceived: 50 },
  { provider: "overridden", flow: "mock", merchantReference: "DKO-DEFAULT", amountExpected: 100 }
);

assert(withDefaults.provider === "mock", "Provided provider wins over default");
assert(withDefaults.flow === "mock", "Missing flow filled from default");
assert(withDefaults.merchantReference === "DKO-DEFAULT", "Missing merchantReference filled from default");
assert(withDefaults.amountExpected === 100, "Missing amountExpected filled from default");
assert(withDefaults.amountReceived === 50, "amountReceived preserved");

const emptyResult = normaliseProviderResult({}, { provider: "mock", flow: "qr" });
assert(emptyResult.provider === "mock" && emptyResult.flow === "qr", "Empty payload with defaults normalises");
assert(emptyResult.merchantReference === null, "Unspecified optional fields default to null");
assert(emptyResult.amountReceived === null, "amountReceived defaults to null");

// Defaults metadata is merged under raw/extras.
const defaultMeta = normaliseProviderResult(
  { provider: "mock", extraFromRaw: 1 },
  { provider: "mock", metadata: { defaultMetaKey: true } }
);
assert(defaultMeta.metadata.defaultMetaKey === true, "Defaults metadata merged in");
assert(defaultMeta.metadata.extraFromRaw === 1, "Raw extras merged alongside defaults metadata");

// ──────────────────────────────────────────────────────────────
// 5. Results are frozen
// ──────────────────────────────────────────────────────────────
console.log("\n5. Immutability");

const frozen = normaliseProviderResult({ provider: "mock" });
assert(Object.isFrozen(frozen), "Normalised result is frozen");
assert(Object.isFrozen(frozen.metadata), "Metadata is frozen");
assertThrows(() => { frozen.provider = "tampered"; }, "Cannot mutate a normalised result");
assertThrows(() => { frozen.metadata.x = 1; }, "Cannot mutate normalised metadata");

// ──────────────────────────────────────────────────────────────
// 6. Invalid input rejected
// ──────────────────────────────────────────────────────────────
console.log("\n6. Input validation");

assertThrows(() => normaliseProviderResult(null), "null input throws TypeError");
assertThrows(() => normaliseProviderResult(undefined), "undefined input throws TypeError");
assertThrows(() => normaliseProviderResult("qr-string"), "Non-object input throws TypeError");
assertThrows(() => normaliseProviderResult(["a", "b"]), "Array input throws TypeError");
assertThrows(() => normaliseProviderResult(42), "Primitive input throws TypeError");

// ──────────────────────────────────────────────────────────────
// 7. Public gateway surface
// ──────────────────────────────────────────────────────────────
console.log("\n7. Public gateway surface");

assert(typeof normaliseProviderResult === "function", "normaliseProviderResult exported from gateway index");
assert(typeof PaymentProvider === "function", "PaymentProvider exported from gateway index");

// The abstract lifecycle methods still fail fast on the base class.
assertThrows(() => new PaymentProvider().name, "Base get name() throws");
assertThrows(() => new PaymentProvider().isConfigured, "Base get isConfigured() throws");
await assertAsyncThrows(() => new PaymentProvider().createPayment({}), "Base createPayment() throws");
await assertAsyncThrows(() => new PaymentProvider().verifyPayment({}), "Base verifyPayment() throws");
await assertAsyncThrows(() => new PaymentProvider().handleCallback({}), "Base handleCallback() throws");
await assertAsyncThrows(() => new PaymentProvider().getPaymentStatus({}), "Base getPaymentStatus() throws");

// ──────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"=".repeat(50)}`);

process.exit(failed > 0 ? 1 : 0);