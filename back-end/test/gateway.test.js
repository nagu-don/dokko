/**
 * Payment gateway tests — run with: node test/gateway.test.js
 *
 * Tests (no database required — pure unit tests):
 *  1. Provider configuration loading with valid env
 *  2. Provider selection (nepalpay vs mock)
 *  3. Malformed configuration handling
 *  4. Environment separation (real vs emvco_test / enabled vs disabled)
 *  5. Provider instance validation
 *  6. Security: secrets not leaked via exports
 *  7. Base provider throws on abstract methods
 *  8. Amount and reference validation
 *  9. Gateway singleton lifecycle
 */

import { fileURLToPath } from "node:url";
import path from "node:path";

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
import NepalpayProvider from "../gateway/nepalpayProvider.js";
import MockProvider from "../gateway/mockProvider.js";

// ── Valid env fixtures ─────────────────────────────────────────
const VALID_NEPALPAY_ENV = {
  PAYMENT_PROVIDER: "nepalpay",
  COMPANY_BANK_ACCOUNT: "0123456789012",
  NEPALPAY_MODE: "real",
  NCHL_MERCHANT_ACCOUNT_TEMPLATE: "0000000000000000",
  NCHL_MERCHANT_NAME: "DOKKO",
  NCHL_MERCHANT_CITY: "Kathmandu",
};

const VALID_MOCK_ENV = {
  PAYMENT_PROVIDER: "mock",
  COMPANY_BANK_ACCOUNT: "0123456789012",
  MOCK_PAYMENT_ENABLED: "true",
};

const VALID_BOTH_ENV = {
  ...VALID_NEPALPAY_ENV,
  PAYMENT_PROVIDER: "nepalpay",
  MOCK_PAYMENT_ENABLED: "true",
};

// ──────────────────────────────────────────────────────────────
// 1. Provider configuration loading
// ──────────────────────────────────────────────────────────────
console.log("\n1. Provider configuration loading");

const nepalpayConfig = loadProviders(VALID_NEPALPAY_ENV);
assert(nepalpayConfig.activeProvider === "nepalpay", "Active provider is nepalpay");
assert(nepalpayConfig.companyBankAccount === "0123456789012", "Company bank account loaded");
assert(nepalpayConfig.providers.nepalpay.isConfigured === true, "Nepalpay provider is configured");
assert(nepalpayConfig.providers.nepalpay.config.mode === "real", "Nepalpay mode loaded");
assert(nepalpayConfig.providers.nepalpay.config.merchantAccountTemplate === "0000000000000000", "Nepalpay merchant account template loaded");
assert(nepalpayConfig.providers.mock.isConfigured === false, "Mock not configured (no env vars)");

const mockConfig = loadProviders(VALID_MOCK_ENV);
assert(mockConfig.activeProvider === "mock", "Active provider is mock");
assert(mockConfig.providers.mock.isConfigured === true, "Mock provider is configured");
assert(mockConfig.providers.nepalpay.isConfigured === false, "Nepalpay not configured when mock env only");

const bothConfig = loadProviders(VALID_BOTH_ENV);
assert(bothConfig.providers.nepalpay.isConfigured === true, "Both providers configured — nepalpay");
assert(bothConfig.providers.mock.isConfigured === true, "Both providers configured — mock");

// ──────────────────────────────────────────────────────────────
// 2. Provider selection
// ──────────────────────────────────────────────────────────────
console.log("\n2. Provider selection");

const nepalpaySelection = loadProviders({ ...VALID_BOTH_ENV, PAYMENT_PROVIDER: "nepalpay" });
assert(nepalpaySelection.activeProvider === "nepalpay", "PAYMENT_PROVIDER=nepalpay selects nepalpay");

const mockSelection = loadProviders({ ...VALID_BOTH_ENV, PAYMENT_PROVIDER: "mock" });
assert(mockSelection.activeProvider === "mock", "PAYMENT_PROVIDER=mock selects mock");

// Default (no PAYMENT_PROVIDER set) falls back to nepalpay
const defaultSelection = loadProviders({ COMPANY_BANK_ACCOUNT: "000", ...VALID_NEPALPAY_ENV, PAYMENT_PROVIDER: undefined });
assert(defaultSelection.activeProvider === "nepalpay", "Default provider is nepalpay");

// ──────────────────────────────────────────────────────────────
// 3. Malformed configuration handling
// ──────────────────────────────────────────────────────────────
console.log("\n3. Malformed configuration handling");

// Missing PAYMENT_PROVIDER but it defaults — should not throw
const noProvider = loadProviders({
  COMPANY_BANK_ACCOUNT: "123",
  ...VALID_NEPALPAY_ENV,
  PAYMENT_PROVIDER: undefined,
});
assert(noProvider.activeProvider === "nepalpay", "Missing PAYMENT_PROVIDER defaults to nepalpay");

// Invalid PAYMENT_PROVIDER
assertThrows(
  () => loadProviders({ ...VALID_NEPALPAY_ENV, PAYMENT_PROVIDER: "paypal" }),
  "Invalid PAYMENT_PROVIDER throws"
);

// Missing COMPANY_BANK_ACCOUNT
assertThrows(
  () => loadProviders({ ...VALID_NEPALPAY_ENV, COMPANY_BANK_ACCOUNT: "" }),
  "Missing COMPANY_BANK_ACCOUNT throws"
);

// Missing NCHL_MERCHANT_ACCOUNT_TEMPLATE — provider not configured but no throw
const missingMerchant = loadProviders({
  COMPANY_BANK_ACCOUNT: "123",
  NEPALPAY_MODE: "real",
  PAYMENT_PROVIDER: "nepalpay",
});
assert(missingMerchant.providers.nepalpay.isConfigured === false, "Nepalpay not configured when merchant account template missing");

// Invalid NEPALPAY_MODE
assertThrows(
  () => loadProviders({
    ...VALID_NEPALPAY_ENV,
    NEPALPAY_MODE: "staging",
  }),
  "Invalid NEPALPAY_MODE throws"
);

// Missing MOCK_PAYMENT_ENABLED — mock not configured
const missingMock = loadProviders({
  COMPANY_BANK_ACCOUNT: "123",
  PAYMENT_PROVIDER: "mock",
});
assert(missingMock.providers.mock.isConfigured === false, "Mock not configured when MOCK_PAYMENT_ENABLED missing");

// Invalid case-insensitive mode normalization
const upperMode = loadProviders({
  COMPANY_BANK_ACCOUNT: "123",
  NEPALPAY_MODE: "REAL",
  NCHL_MERCHANT_ACCOUNT_TEMPLATE: "0000000000000000",
  PAYMENT_PROVIDER: "nepalpay",
});
assert(upperMode.providers.nepalpay.config.mode === "real", "Mode is normalised to lowercase");

// ──────────────────────────────────────────────────────────────
// 4. Environment separation (real vs emvco_test / enabled vs disabled)
// ──────────────────────────────────────────────────────────────
console.log("\n4. Environment separation");

// Nepalpay real mode
const realConfig = loadProviders({
  ...VALID_NEPALPAY_ENV,
  NEPALPAY_MODE: "real",
});
assert(realConfig.providers.nepalpay.config.mode === "real", "Real mode stored correctly");

// Nepalpay emvco_test mode
const emvcoConfig = loadProviders({
  ...VALID_NEPALPAY_ENV,
  NEPALPAY_MODE: "emvco_test",
});
assert(emvcoConfig.providers.nepalpay.config.mode === "emvco_test", "Emvco_test mode stored correctly");

// Ensure real and emvco_test produce different config
assert(realConfig.providers.nepalpay.config.mode !== emvcoConfig.providers.nepalpay.config.mode, "Real and emvco_test configs differ");

// Config objects are frozen
assertThrows(
  () => { realConfig.providers.nepalpay.config.mode = "staging"; },
  "Config object is frozen (immutable)"
);

// Mock enabled vs disabled
const mockEnabled = loadProviders({
  ...VALID_MOCK_ENV,
  MOCK_PAYMENT_ENABLED: "true",
});
assert(mockEnabled.providers.mock.config.enabled === true, "Mock enabled when MOCK_PAYMENT_ENABLED=true");

// ──────────────────────────────────────────────────────────────
// 5. Provider instance validation
// ──────────────────────────────────────────────────────────────
console.log("\n5. Provider instance validation");

const validNepalpay = new NepalpayProvider({
  mode: "real",
  merchantAccountTemplate: "0000000000000000",
  merchantName: "DOKKO",
  merchantCity: "Kathmandu",
});
assert(validNepalpay.name === "nepalpay", "NepalpayProvider.name returns 'nepalpay'");
assert(validNepalpay.isConfigured === true, "NepalpayProvider.isConfigured with valid config");

const invalidNepalpay = new NepalpayProvider({
  mode: "real",
  merchantAccountTemplate: "",
  merchantName: "",
  merchantCity: "",
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

// validateConfig throws on invalid
const badModeNepalpay = new NepalpayProvider({
  mode: "invalid",
  merchantAccountTemplate: "0000000000000000",
  merchantName: "DOKKO",
  merchantCity: "Kathmandu",
});
assertThrows(() => badModeNepalpay.validateConfig(), "NepalpayProvider.validateConfig throws on invalid mode");

const missingTemplateNepalpay = new NepalpayProvider({
  mode: "real",
  merchantAccountTemplate: "",
  merchantName: "DOKKO",
  merchantCity: "Kathmandu",
});
assertThrows(() => missingTemplateNepalpay.validateConfig(), "NepalpayProvider.validateConfig throws on missing merchant account template");

const missingModeNepalpay = new NepalpayProvider({
  mode: "",
  merchantAccountTemplate: "0000000000000000",
  merchantName: "DOKKO",
  merchantCity: "Kathmandu",
});
assertThrows(() => missingModeNepalpay.validateConfig(), "NepalpayProvider.validateConfig throws on missing mode");

const disabledMock = new MockProvider({
  enabled: false,
});
assertThrows(() => disabledMock.validateConfig(), "MockProvider.validateConfig throws when disabled");

// ──────────────────────────────────────────────────────────────
// 6. Security: secrets not leaked
// ──────────────────────────────────────────────────────────────
console.log("\n6. Security: secrets not leaked");

const cfg = loadProviders(VALID_NEPALPAY_ENV);

// Provider config is frozen
assert(Object.isFrozen(cfg), "loadProviders result is frozen");
assert(Object.isFrozen(cfg.providers), "providers map is frozen");

// Config objects are frozen
assert(Object.isFrozen(cfg.providers.nepalpay.config), "Nepalpay config is frozen");

// Gateway status does not expose secrets
const status = getGatewayStatus();
assert(!JSON.stringify(status).includes("super-secret"), "Gateway status does not contain secrets");
assert(!JSON.stringify(status).includes("key"), "Gateway status does not contain secret keys");
assert(status.activeProvider !== undefined, "Status includes activeProvider");
assert(status.isReady !== undefined, "Status includes isReady");

// Company bank account is not in gateway status
assert(!JSON.stringify(status).includes("0123456789012"), "Company bank account not in status");

// Provider instances don't leak config via JSON serialization
const nepalpayInstance = new NepalpayProvider(cfg.providers.nepalpay.config);
const serialized = JSON.stringify(nepalpayInstance);
assert(!serialized.includes("secret"), "Serialized provider instance does not contain secret key");

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
  mode: "real",
  merchantAccountTemplate: "0000000000000000",
  merchantName: "DOKKO",
  merchantCity: "Kathmandu",
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

// loadGateway returns config
const gwConfig = loadGateway(VALID_NEPALPAY_ENV);
assert(gwConfig.activeProvider === "nepalpay", "loadGateway sets active provider");
assert(isActiveProviderReady(gwConfig) === true, "Active provider is ready");

// getProvider returns a provider instance
const gwProvider = getProvider();
assert(gwProvider.name === "nepalpay", "getProvider returns nepalpay instance");
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
loadGateway(VALID_NEPALPAY_ENV);
assert(getCompanyBankAccount() === "0123456789012", "getCompanyBankAccount returns correct value");

// Status reflects current gateway state
const gwStatus = getGatewayStatus();
assert(gwStatus.activeProvider === "nepalpay", "Status shows active provider");
assert(gwStatus.isReady === true, "Status shows ready");
assert(Array.isArray(gwStatus.availableProviders), "Status has availableProviders array");

// getGatewayStatus before loadGateway
// (simulate by testing the function directly — it uses module state)
// The module is already loaded, so we test the shape
assert(typeof gwStatus.activeProvider === "string", "Status activeProvider is string");
assert(typeof gwStatus.isReady === "boolean", "Status isReady is boolean");

// ──────────────────────────────────────────────────────────────
// 10. Provider map exports
// ──────────────────────────────────────────────────────────────
console.log("\n10. Provider map exports");

assert(PROVIDER_MAP.nepalpay === NepalpayProvider, "PROVIDER_MAP.nepalpay is NepalpayProvider");
assert(PROVIDER_MAP.mock === MockProvider, "PROVIDER_MAP.mock is MockProvider");
assert(ALLOWED_ENVIRONMENTS.includes("sandbox"), "ALLOWED_ENVIRONMENTS includes sandbox");
assert(ALLOWED_ENVIRONMENTS.includes("production"), "ALLOWED_ENVIRONMENTS includes production");
assert(DEFAULT_ENVIRONMENT === "sandbox", "DEFAULT_ENVIRONMENT is sandbox");
assert(typeof CONFIG_LOADERS.nepalpay === "function", "CONFIG_LOADERS.nepalpay is function");
assert(typeof CONFIG_LOADERS.mock === "function", "CONFIG_LOADERS.mock is function");

// ──────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"=".repeat(50)}`);

process.exit(failed > 0 ? 1 : 0);
