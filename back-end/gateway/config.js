/**
 * Provider configuration — loads and validates payment gateway settings
 * from environment variables at startup.
 *
 * Secrets are read from process.env ONLY.  They are never exported to
 * the module boundary as named exports — only accessed through the
 * normalised config objects returned by loadProviders().
 *
 * Environment variables
 * ──────────────────────
 * Payment provider selection:
 *   PAYMENT_PROVIDER        — "nepalpay" | "mock" | "cash" (which provider is active)
 *   COMPANY_BANK_ACCOUNT    — company bank account (internal use only)
 *
 * NepalPay (EMVCo QR):
 *   NEPALPAY_MODE           — "real" | "emvco_test"
 *   NCHL_MERCHANT_ACCOUNT_TEMPLATE — acquiring-bank/NCHL merchant TLV template
 *   NCHL_MERCHANT_NAME      — merchant display name (optional, default: DOKKO)
 *   NCHL_MERCHANT_CITY      — merchant city (optional, default: Kathmandu)
 */

import NepalpayProvider from "./nepalpayProvider.js";
import MockProvider from "./mockProvider.js";

// ── Provider registry ──────────────────────────────────────────
const PROVIDER_MAP = {
  nepalpay: NepalpayProvider,
  mock: MockProvider,
};

// ── Allowed values ─────────────────────────────────────────────
const ALLOWED_ENVIRONMENTS = ["production", "sandbox"];
const DEFAULT_ENVIRONMENT = "sandbox";

/**
 * Read a required env var or throw a descriptive error.
 */
function requireEnv(name) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Read an optional env var with a default fallback.
 */
function optionalEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return value;
}

function loadNepalpayConfig() {
  const mode = optionalEnv("NEPALPAY_MODE", "real").toLowerCase();
  const merchantAccountTemplate = requireEnv("NCHL_MERCHANT_ACCOUNT_TEMPLATE");
  return Object.freeze({ provider: "nepalpay", mode, merchantAccountTemplate, merchantName: optionalEnv("NCHL_MERCHANT_NAME", "DOKKO"), merchantCity: optionalEnv("NCHL_MERCHANT_CITY", "Kathmandu") });
}

function loadMockConfig() {
  if (optionalEnv("MOCK_PAYMENT_ENABLED", "false") !== "true") throw new Error("Missing required environment variable: MOCK_PAYMENT_ENABLED");
  return Object.freeze({ provider: "mock", enabled: process.env.NODE_ENV !== "production" });
}

// ── Config loaders keyed by provider name ──────────────────────
const CONFIG_LOADERS = {
  nepalpay: loadNepalpayConfig,
  mock: loadMockConfig,
};

/**
 * Load configuration for a single provider.
 * Returns { name, config, ProviderClass } or null when the provider
 * is not selected by PAYMENT_PROVIDER.
 *
 * @param {string} providerName — "nepalpay" | "mock"
 * @returns {{ name: string, config: Object, ProviderClass: Function } | null}
 */
function loadProviderConfig(providerName) {
  const loader = CONFIG_LOADERS[providerName];
  if (!loader) {
    throw new Error(
      `Unknown payment provider "${providerName}". Supported: ${Object.keys(PROVIDER_MAP).join(", ")}`
    );
  }
  const config = loader();
  return { name: providerName, config, ProviderClass: PROVIDER_MAP[providerName] };
}

/**
 * Load all provider configurations and return a normalised result.
 *
 * Returns:
 *   {
 *     activeProvider: "nepalpay" | "mock",
 *     providers: {
 *       nepalpay: { config, ProviderClass, isConfigured },
 *       mock:     { config, ProviderClass, isConfigured },
 *     },
 *     companyBankAccount: "XXXXXXXXXXXX",
 *   }
 *
 * When PAYMENT_PROVIDER is not set, activeProvider defaults to "nepalpay".
 * When provider-specific env vars are missing, that provider is marked
 * as not configured but still present in the map (for future use).
 *
 * @param {Object} [envOverride] — optional env override for testing
 * @returns {Object}
 */
export function loadProviders(envOverride) {
  const env = envOverride || process.env;

  // save and restore original process.env for the duration of this call
  // when an override is provided (testing convenience)
  const originalEnv = process.env;
  if (envOverride) {
    process.env = { ...process.env, ...envOverride };
  }

  try {
    const activeProvider = optionalEnv("PAYMENT_PROVIDER", "nepalpay");

    if (!PROVIDER_MAP[activeProvider]) {
      throw new Error(
        `Invalid PAYMENT_PROVIDER "${activeProvider}". Supported: ${Object.keys(PROVIDER_MAP).join(", ")}`
      );
    }

    const companyBankAccount = requireEnv("COMPANY_BANK_ACCOUNT");

    const providers = {};

    for (const [name, ProviderClass] of Object.entries(PROVIDER_MAP)) {
      let config = null;
      let isConfigured = false;

      try {
        config = CONFIG_LOADERS[name]();
        // instantiate and validate
        const instance = new ProviderClass(config);
        instance.validateConfig();
        isConfigured = true;
      } catch (err) {
        // Missing env vars mean "provider not configured" — that's fine.
        // Invalid values are real errors that must propagate.
        const msg = String(err.message || err);
        if (msg.includes("Missing required environment variable")) {
          config = null;
          isConfigured = false;
        } else {
          throw err;
        }
      }

      providers[name] = { config, ProviderClass, isConfigured };
    }

    return Object.freeze({
      activeProvider,
      providers: Object.freeze(providers),
      companyBankAccount,
    });
  } finally {
    if (envOverride) {
      process.env = originalEnv;
    }
  }
}

/**
 * Quick check: is the active provider fully configured?
 * @param {Object} providerConfig — the result of loadProviders()
 * @returns {boolean}
 */
export function isActiveProviderReady(providerConfig) {
  return providerConfig.providers[providerConfig.activeProvider]?.isConfigured === true;
}

/**
 * Instantiate the active provider with its config.
 * Returns a ready-to-use PaymentProvider instance.
 *
 * @param {Object} providerConfig — the result of loadProviders()
 * @returns {PaymentProvider}
 */
export function createActiveProvider(providerConfig) {
  const entry = providerConfig.providers[providerConfig.activeProvider];
  if (!entry) {
    throw new Error(`Active provider "${providerConfig.activeProvider}" not found in config`);
  }
  if (!entry.isConfigured) {
    throw new Error(`Active provider "${providerConfig.activeProvider}" is not configured (missing env vars)`);
  }
  return new entry.ProviderClass(entry.config);
}

export { PROVIDER_MAP, CONFIG_LOADERS, ALLOWED_ENVIRONMENTS, DEFAULT_ENVIRONMENT };
