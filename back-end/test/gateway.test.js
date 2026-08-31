/**
 * Payment gateway tests — run with: node test/gateway.test.js
 *
 * Tests (no database required — pure unit tests):
 *  1. Provider configuration loading with valid env
 *  2. Provider selection (mock vs fonepay)
 *  3. Malformed configuration handling
 *  4. Provider enablement (mock / fonepay pending)
 *  5. Provider instance validation (direct class tests, incl. legacy nepalpay)
 *  6. Security: secrets not leaked via exports
 *  7. Base provider throws on abstract methods
 *  8. Amount and reference validation
 *  9. Gateway singleton lifecycle
 * 10. Provider map exports (mock + fonepay; nepalpay unregistered)
 * 11. Fonepay not-ready: registered, never ready, no silent fallback
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

// ── Import gateway modules ─────────────────────────────────────
import { loadProviders, isActiveProviderReady, PROVIDER_MAP, CONFIG_LOADERS, ALLOWED_ENVIRONMENTS, DEFAULT_ENVIRONMENT } from "../gateway/config.js";
import { loadGateway, getProvider, getGatewayStatus, getCompanyBankAccount } from "../gateway/index.js";
import PaymentProvider from "../gateway/providerBase.js";
import FonepayProvider, { FonepayNotConfiguredError } from "../gateway/fonepayProvider.js";
import NepalpayProvider from "../gateway/nepalpayProvider.js";
import MockProvider from "../gateway/mockProvider.js";

// ── Valid env fixtures ─────────────────────────────────────────
// Legacy NCHL env is kept ONLY to exercise the direct NepalpayProvider class
// (nepalpay is no longer wired into the config registry).
import { writeFileSync } from "node:fs";

const TEST_PFX_PATH = path.join(os.tmpdir(), `nchl-gw-${Date.now()}.pfx`);
try { writeFileSync(TEST_PFX_PATH, Buffer.from("dummy-pfx")); } catch {}

const createTestPfx = () => TEST_PFX_PATH;

const VALID_MOCK_ENV = {
  PAYMENT_PROVIDER: "mock",
  COMPANY_BANK_ACCOUNT: "0123456789012",
  MOCK_PAYMENT_ENABLED: "true",
};

const VALID_FONEPAY_ENV = {
  PAYMENT_PROVIDER: "fonepay",
  COMPANY_BANK_ACCOUNT: "0123456789012",
};

// ──────────────────────────────────────────────────────────────
// 1. Provider configuration loading
// ──────────────────────────────────────────────────────────────
console.log("\n1. Provider configuration loading");

const mockConfig = loadProviders(VALID_MOCK_ENV);
assert(mockConfig.activeProvider === "mock", "Active provider is mock");
assert(mockConfig.companyBankAccount === "0123456789012", "Company bank account loaded");
assert(mockConfig.providers.mock.isConfigured === true, "Mock provider is configured (MOCK_PAYMENT_ENABLED=true)");
assert(mockConfig.providers.fonepay.isConfigured === false, "Fonepay is never configured (pending)");

const fonepayConfig = loadProviders(VALID_FONEPAY_ENV);
assert(fonepayConfig.activeProvider === "fonepay", "Active provider is fonepay");
assert(fonepayConfig.providers.fonepay.isConfigured === false, "Fonepay is NOT ready (no official credentials)");

// ──────────────────────────────────────────────────────────────
// 2. Provider selection
// ──────────────────────────────────────────────────────────────
console.log("\n2. Provider selection");

const mockSelection = loadProviders({ ...VALID_MOCK_ENV, PAYMENT_PROVIDER: "mock" });
assert(mockSelection.activeProvider === "mock", "PAYMENT_PROVIDER=mock selects mock");

const fonepaySelection = loadProviders({ ...VALID_FONEPAY_ENV, PAYMENT_PROVIDER: "fonepay" });
assert(fonepaySelection.activeProvider === "fonepay", "PAYMENT_PROVIDER=fonepay selects fonepay");

// Default (no PAYMENT_PROVIDER set) defaults to mock
const defaultSelection = loadProviders({ COMPANY_BANK_ACCOUNT: "000", MOCK_PAYMENT_ENABLED: "true", PAYMENT_PROVIDER: undefined });
assert(defaultSelection.activeProvider === "mock", "Default provider is mock");

// ──────────────────────────────────────────────────────────────
// 3. Malformed configuration handling
// ──────────────────────────────────────────────────────────────
console.log("\n3. Malformed configuration handling");

// Missing PAYMENT_PROVIDER but it defaults — should not throw
const noProvider = loadProviders({
  COMPANY_BANK_ACCOUNT: "123",
  MOCK_PAYMENT_ENABLED: "true",
  PAYMENT_PROVIDER: undefined,
});
assert(noProvider.activeProvider === "mock", "Missing PAYMENT_PROVIDER defaults to mock");

// Invalid PAYMENT_PROVIDER
assertThrows(
  () => loadProviders({ ...VALID_MOCK_ENV, PAYMENT_PROVIDER: "paypal" }),
  "Invalid PAYMENT_PROVIDER throws"
);

// Missing COMPANY_BANK_ACCOUNT
assertThrows(
  () => loadProviders({ ...VALID_MOCK_ENV, COMPANY_BANK_ACCOUNT: "" }),
  "Missing COMPANY_BANK_ACCOUNT throws"
);

// Unknown provider (e.g. legacy nepalpay) is rejected
assertThrows(
  () => loadProviders({ ...VALID_MOCK_ENV, PAYMENT_PROVIDER: "nepalpay" }),
  "Legacy nepalpay PAYMENT_PROVIDER is rejected (no longer registered)"
);

// Missing MOCK_PAYMENT_ENABLED — mock not configured
const missingMock = loadProviders({
  COMPANY_BANK_ACCOUNT: "123",
  PAYMENT_PROVIDER: "mock",
  MOCK_PAYMENT_ENABLED: "", // force unset regardless of the loaded .env
});
assert(missingMock.providers.mock.isConfigured === false, "Mock not configured when MOCK_PAYMENT_ENABLED missing");

// ──────────────────────────────────────────────────────────────
// 4. Provider enablement (mock / fonepay pending)
// ──────────────────────────────────────────────────────────────
console.log("\n4. Provider enablement");

// Mock enabled vs disabled
const mockEnabled = loadProviders({
  ...VALID_MOCK_ENV,
  MOCK_PAYMENT_ENABLED: "true",
});
assert(mockEnabled.providers.mock.config.enabled === true, "Mock enabled when MOCK_PAYMENT_ENABLED=true");

// Mock disabled without env — not configured, but no throw
const mockDisabled = loadProviders({ ...VALID_MOCK_ENV, MOCK_PAYMENT_ENABLED: "" });
assert(mockDisabled.providers.mock.isConfigured === false, "Mock not configured without MOCK_PAYMENT_ENABLED=true");

// Fonepay is always pending (never ready) regardless of env
const fonepayNever = loadProviders({ ...VALID_MOCK_ENV, MOCK_PAYMENT_ENABLED: "true", PAYMENT_PROVIDER: "fonepay" });
assert(fonepayNever.providers.fonepay.isConfigured === false, "Fonepay not configured even with mock env present");

// ──────────────────────────────────────────────────────────────
// 5. Provider instance validation
// ──────────────────────────────────────────────────────────────
console.log("\n5. Provider instance validation");

// A fully configured nepalpay instance (with a real cert path).
// For unit tests we use a config object directly; isConfigured requires
// all NCHL fields.
const validNepalpay = new NepalpayProvider({
  apiBaseUrl: "https://nchl.example.com",
  apiUsername: "u",
  apiPassword: "p",
  acquirerId: "A",
  merchantId: "M",
  userId: "U",
  pfxPath: createTestPfx(),
  pfxPassword: "",
  merchantName: "DOKKO",
  merchantCategoryCode: 5399,
  merchantCity: "Kathmandu",
  merchantCountry: "NP",
  merchantPostalCode: "4600",
  merchantLanguage: "en",
  storeLabel: "DOKKO",
  terminalLabel: "Terminal1",
});
assert(validNepalpay.name === "nepalpay", "NepalpayProvider.name returns 'nepalpay'");
// isConfigured checks for presence of the NCHL fields. The pfxPath is a
// non-existent file so we only verify the field-presence semantics here.
assert(validNepalpay.isConfigured === true, "NepalpayProvider.isConfigured with complete NCHL config");

const invalidNepalpay = new NepalpayProvider({
  apiBaseUrl: "",
  apiUsername: "",
  apiPassword: "",
  acquirerId: "",
  merchantId: "",
  userId: "",
  pfxPath: "",
});
assert(invalidNepalpay.isConfigured === false, "NepalpayProvider.isConfigured with empty config");

const validMock = new MockProvider({
  enabled: true,
});
assert(validMock.name === "mock", "MockProvider.name returns 'mock'");
assert(validMock.isConfigured === true, "MockProvider.isConfigured with valid config");

const invalidMock = new MockProvider({
  enabled: false,
});
assert(invalidMock.isConfigured === false, "MockProvider.isConfigured with disabled config");

// ── Fonepay safe boundary: never configured, no homemade QR ──
// The whole point: Fonepay can be SELECTED but is never ready, and every
// payment/QR entry point is a hard FONEPAY_NOT_CONFIGURED error — it can
// NEVER fabricate a Homemade/EMVCo QR locally.
const fonepayInstance = new FonepayProvider();
assert(fonepayInstance.name === "fonepay", "FonepayProvider.name returns 'fonepay'");
assert(fonepayInstance.isConfigured === false, "FonepayProvider.isConfigured is always false");

// validateConfig fails safely with the dedicated error code
let fpCfgErr = null;
try { fonepayInstance.validateConfig(); } catch (e) { fpCfgErr = e; }
assert(fpCfgErr instanceof FonepayNotConfiguredError, "Fonepay validateConfig throws FonepayNotConfiguredError");
assert(fpCfgErr?.code === "FONEPAY_NOT_CONFIGURED", "Fonepay error code is FONEPAY_NOT_CONFIGURED");

// createPayment must throw (produces NO QR / payload) — no homemade Fonepay QR
const assertFpNotConfigured = async (fn, label) => {
  try {
    const out = await fn();
    console.error(`  \u2717 ${label} — expected FONEPAY_NOT_CONFIGURED but got: ${JSON.stringify(out)}`);
    failed++;
  } catch (e) {
    if (e instanceof FonepayNotConfiguredError) {
      console.log(`  \u2713 ${label} (code=${e.code})`);
      passed++;
    } else {
      console.error(`  \u2717 ${label} — wrong error: ${e.constructor?.name}: ${e.message}`);
      failed++;
    }
  }
};
await assertFpNotConfigured(() => fonepayInstance.createPayment(), "Fonepay createPayment throws (no homemade QR)");
await assertFpNotConfigured(() => fonepayInstance.generateQr(), "Fonepay generateQr throws (QR generation disabled)");
await assertFpNotConfigured(() => fonepayInstance.verifyPayment({}), "Fonepay verifyPayment throws (not implemented)");
await assertFpNotConfigured(() => fonepayInstance.getPaymentStatus({}), "Fonepay getPaymentStatus throws (not implemented)");
await assertFpNotConfigured(() => fonepayInstance.handleCallback({}), "Fonepay handleCallback throws (not implemented)");

// validateConfig throws on missing NCHL config
const missingConfigNepalpay = new NepalpayProvider({
  apiBaseUrl: "",
  apiUsername: "",
  apiPassword: "",
  acquirerId: "",
  merchantId: "",
  userId: "",
  pfxPath: "",
});
assertThrows(() => missingConfigNepalpay.validateConfig(), "NepalpayProvider.validateConfig throws on missing NCHL config");

const disabledMock = new MockProvider({
  enabled: false,
});
assertThrows(() => disabledMock.validateConfig(), "MockProvider.validateConfig throws when disabled");

// ──────────────────────────────────────────────────────────────
// 6. Security: secrets not leaked
// ──────────────────────────────────────────────────────────────
console.log("\n6. Security: secrets not leaked");

// Use a mock-only env so that nepalpay config (which requires a real
// cert file) is not loaded. Provider configs that load are frozen.
const cfg = loadProviders(VALID_MOCK_ENV);

// Provider config is frozen
assert(Object.isFrozen(cfg), "loadProviders result is frozen");
assert(Object.isFrozen(cfg.providers), "providers map is frozen");

// Config objects are frozen
assert(Object.isFrozen(cfg.providers.mock.config), "Mock config is frozen");

// Gateway status does not expose secrets
const status = getGatewayStatus();
assert(!JSON.stringify(status).includes("super-secret"), "Gateway status does not contain secrets");
assert(!JSON.stringify(status).includes("key"), "Gateway status does not contain secret keys");
assert(status.activeProvider !== undefined, "Status includes activeProvider");
assert(status.isReady !== undefined, "Status includes isReady");

// Company bank account is not in gateway status
assert(!JSON.stringify(status).includes("0123456789012"), "Company bank account not in status");

// Provider instances don't leak config via JSON serialization
const nepalpayInstance = new NepalpayProvider({
  apiBaseUrl: "https://nchl.example.com",
  apiUsername: "u", apiPassword: "p", acquirerId: "A", merchantId: "M",
  userId: "U", pfxPath: createTestPfx(), pfxPassword: "", merchantName: "DOKKO",
});
const serialized = JSON.stringify(nepalpayInstance);
assert(!serialized.includes("secret"), "Serialized provider instance does not contain secret key");
assert(!serialized.includes("apiPassword"), "Serialized provider instance does not contain password");
assert(!serialized.includes("pass"), "Serialized provider instance does not contain credential value");

// ──────────────────────────────────────────────────────────────
// 7. Base provider abstract methods throw
// ──────────────────────────────────────────────────────────────
console.log("\n7. Base provider abstract methods throw");

assertThrows(() => new PaymentProvider().name, "Base get name() throws");
assertThrows(() => new PaymentProvider().isConfigured, "Base get isConfigured() throws");
assertThrows(() => new PaymentProvider().validateConfig(), "Base validateConfig() throws");
await assertAsyncThrows(() => new PaymentProvider().createPayment({}), "Base createPayment() throws");
await assertAsyncThrows(() => new PaymentProvider().generateQr({}), "Base generateQr() throws");
await assertAsyncThrows(() => new PaymentProvider().verifyPayment({}), "Base verifyPayment() throws");
await assertAsyncThrows(() => new PaymentProvider().getPaymentStatus({}), "Base getPaymentStatus() throws");
await assertAsyncThrows(() => new PaymentProvider().handleCallback({}), "Base handleCallback() throws");

// ──────────────────────────────────────────────────────────────
// 8. Amount and reference validation
// ──────────────────────────────────────────────────────────────
console.log("\n8. Amount and reference validation");

const provider = new NepalpayProvider({
  apiBaseUrl: "https://nchl.example.com",
  apiUsername: "u",
  apiPassword: "p",
  acquirerId: "A",
  merchantId: "M",
  userId: "U",
  pfxPath: createTestPfx(),
  pfxPassword: "",
  merchantName: "DOKKO",
  merchantCategoryCode: 5399,
  merchantCity: "Kathmandu",
  merchantCountry: "NP",
  merchantPostalCode: "4600",
  merchantLanguage: "en",
  storeLabel: "DOKKO",
  terminalLabel: "Terminal1",
});

// Amount validation
assert(provider.validateAmount(100, 100) === true, "Amount 100 === 100");
assert(provider.validateAmount(100, 100.0) === true, "Amount 100 === 100.0");
assert(provider.validateAmount(100, 200) === false, "Amount 100 !== 200");
assert(provider.validateAmount(100, "100") === true, "Amount 100 === '100' (string coerced)");
assert(provider.validateAmount(100, 99.99) === false, "Amount 100 !== 99.99");

// Reference validation
assert(provider.validateReference("merchant-ref-123") === true, "Valid reference accepted");
assert(provider.validateReference(" ") === false, "Whitespace-only reference rejected");
assert(provider.validateReference("") === false, "Empty reference rejected");
assert(provider.validateReference(null) === false, "Null reference rejected");
assert(provider.validateReference(undefined) === false, "Undefined reference rejected");
assert(provider.validateReference(12345) === false, "Non-string reference rejected");

const mockProvider = new MockProvider({
  enabled: true,
});

assert(mockProvider.validateAmount(500, 500) === true, "Mock: amount 500 === 500");
assert(mockProvider.validateReference("mock-ref-456") === true, "Mock: valid reference accepted");

// ──────────────────────────────────────────────────────────────
// 9. Gateway singleton lifecycle
// ──────────────────────────────────────────────────────────────
console.log("\n9. Gateway singleton lifecycle");

// A fully-configured active provider (mock) works through the singleton.
const gwConfig = loadGateway(VALID_MOCK_ENV);
assert(gwConfig.activeProvider === "mock", "loadGateway sets active provider");
assert(isActiveProviderReady(gwConfig) === true, "Active provider is ready");

// getProvider returns a provider instance
const gwProvider = getProvider();
assert(gwProvider.name === "mock", "getProvider returns mock instance");
assert(gwProvider.isConfigured === true, "getProvider instance is configured");

// getProvider returns the same singleton
const gwProvider2 = getProvider();
assert(gwProvider === gwProvider2, "getProvider returns same singleton instance");

// Reloading gateway resets the singleton
loadGateway({ ...VALID_MOCK_ENV, PAYMENT_PROVIDER: "mock" });
const newProvider = getProvider();
assert(newProvider.name === "mock", "After reload, getProvider returns mock");
assert(newProvider !== gwProvider, "After reload, getProvider returns new instance");

// getCompanyBankAccount works
loadGateway(VALID_MOCK_ENV);
assert(getCompanyBankAccount() === "0123456789012", "getCompanyBankAccount returns correct value");

// Status reflects current gateway state
const gwStatus = getGatewayStatus();
assert(gwStatus.activeProvider === "mock", "Status shows active provider");
assert(gwStatus.isReady === true, "Status shows ready");
assert(Array.isArray(gwStatus.availableProviders), "Status has availableProviders array");

// getGatewayStatus before loadGateway
// (simulate by testing the function directly — it uses module state)
// The module is already loaded, so we test the shape
assert(typeof gwStatus.activeProvider === "string", "Status activeProvider is string");
assert(typeof gwStatus.isReady === "boolean", "Status isReady is boolean");

// ── Fonepay fails safely when not ready (no silent fallback) ──
// PAYMENT_PROVIDER=fonepay stays fonepay even though it is not ready.
// loadGateway does NOT throw (fonepay is a valid selection), but the gateway
// reports isReady=false and getProvider() fails. It NEVER silently falls
// back to mock.
console.log("\n9b. Fonepay not-ready: registered, never ready, no fallback");

const fpGwConfig = loadGateway(VALID_FONEPAY_ENV);
assert(fpGwConfig.activeProvider === "fonepay", "loadGateway keeps active provider = fonepay");
assert(isActiveProviderReady(fpGwConfig) === false, "Fonepay active provider is NOT ready");

const fpGwStatus = getGatewayStatus();
assert(fpGwStatus.activeProvider === "fonepay", "Status activeProvider is fonepay");
assert(fpGwStatus.isReady === false, "Status isReady is false for fonepay");
assert(!fpGwStatus.availableProviders.includes("fonepay"), "Fonepay is NOT in availableProviders");

assertThrows(
  () => getProvider(),
  "getProvider throws when active fonepay is not configured (no mock fallback)"
);

// ──────────────────────────────────────────────────────────────
// 10. Provider map exports
// ──────────────────────────────────────────────────────────────
console.log("\n10. Provider map exports");

assert(PROVIDER_MAP.mock === MockProvider, "PROVIDER_MAP.mock is MockProvider");
assert(PROVIDER_MAP.fonepay === FonepayProvider, "PROVIDER_MAP.fonepay is FonepayProvider");
assert(PROVIDER_MAP.nepalpay === undefined, "PROVIDER_MAP.nepalpay is undefined (unregistered)");
assert(PROVIDER_MAP.esewa === undefined, "PROVIDER_MAP.esewa is undefined (unregistered)");
assert(ALLOWED_ENVIRONMENTS.includes("sandbox"), "ALLOWED_ENVIRONMENTS includes sandbox");
assert(ALLOWED_ENVIRONMENTS.includes("production"), "ALLOWED_ENVIRONMENTS includes production");
assert(DEFAULT_ENVIRONMENT === "sandbox", "DEFAULT_ENVIRONMENT is sandbox");
assert(typeof CONFIG_LOADERS.mock === "function", "CONFIG_LOADERS.mock is function");
assert(typeof CONFIG_LOADERS.fonepay === "function", "CONFIG_LOADERS.fonepay is function");
assert(CONFIG_LOADERS.nepalpay === undefined, "CONFIG_LOADERS.nepalpay is undefined (unregistered)");

// ──────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"=".repeat(50)}`);

process.exit(failed > 0 ? 1 : 0);
