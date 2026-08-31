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
 *   PAYMENT_PROVIDER        — "mock" | "fonepay" (which provider is active)
 *   COMPANY_BANK_ACCOUNT    — company bank account (internal use only)
 *
 * Mock (development/test only):
 *   MOCK_PAYMENT_ENABLED    — "true" enables the mock provider
 *
 * Fonepay (Dynamic QR): CONFIGURATION PENDING. Official Fonepay
 * credentials/API parameters are not documented in this project yet, so no
 * FONEPAY_* variables exist. Fonepay can be SELECTED (PAYMENT_PROVIDER) but
 * is never ready — initiation fails safely and NEVER silently falls back to
 * another provider. FONEPAY_* variables will be added once the official
 * documentation is supplied.
 *
 * NCHL/NEPALPAY is no longer part of the active payment architecture. The
 * legacy integration files (gateway/nchlApi.js, gateway/nepalpayProvider.js)
 * remain in the repo as a reference and are intentionally NOT wired into this
 * configuration.
 */

import MockProvider from "./mockProvider.js";
import FonepayProvider from "./fonepayProvider.js";

// ── Provider registry ──────────────────────────────────────────
const PROVIDER_MAP = {
  mock: MockProvider,
  fonepay: FonepayProvider,
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

function loadMockConfig() {
  if (optionalEnv("MOCK_PAYMENT_ENABLED", "false") !== "true") throw new Error("Missing required environment variable: MOCK_PAYMENT_ENABLED");
  return Object.freeze({ provider: "mock", enabled: process.env.NODE_ENV !== "production" });
}

/**
 * Fonepay (Dynamic QR) — configuration boundary is deliberately minimal and
 * PENDING. Official Fonepay credentials/API parameters are not documented in
 * this project, so NO FONEPAY_* environment variables are created here.
 *
 * The loader returns a frozen config marked `pendingConfiguration: true`,
 * which loadProviders() interprets as "registered but never ready" — the
 * provider is present in the registry, is never instantiated/validated, and
 * is never silently replaced by another provider. Once the official Fonepay
 * documentation is supplied, this loader will be implemented to read the
 * real FONEPAY_* variables.
 */
function loadFonepayConfig() {
  return Object.freeze({
    provider: "fonepay",
    pendingConfiguration: true,
  });
}

// ── Config loaders keyed by provider name ──────────────────────
const CONFIG_LOADERS = {
  mock: loadMockConfig,
  fonepay: loadFonepayConfig,
};

/**
 * Load all provider configurations and return a normalised result.
 *
 * Returns:
 *   {
 *     activeProvider: "mock" | "fonepay",
 *     providers: {
 *       mock:     { config, ProviderClass, isConfigured },
 *       fonepay:  { config, ProviderClass, isConfigured },
 *     },
 *     companyBankAccount: "XXXXXXXXXXXX",
 *   }
 *
 * When PAYMENT_PROVIDER is not set, activeProvider defaults to "mock".
 * When provider-specific env vars are missing, that provider is marked
 * as not configured but still present in the map (for future use).
 *
 * A registered provider whose config is marked `pendingConfiguration`
 * (Fonepay until its official credentials are documented) is kept in the
 * map but is NEVER configured — this is a deliberate non-fallback: the
 * ACTIVE provider remains exactly what PAYMENT_PROVIDER requested, so a
 * not-ready selected provider fails safely.
 *
 * @param {Object} [envOverride] — optional env override for testing
 * @returns {Object}
 */
export function loadProviders(envOverride) {
  // save and restore original process.env for the duration of this call
  // when an override is provided (testing convenience)
  const originalEnv = process.env;
  if (envOverride) {
    process.env = { ...process.env, ...envOverride };
  }

  try {
    const activeProvider = optionalEnv("PAYMENT_PROVIDER", "mock");

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

        // A provider awaiting official configuration (Fonepay) is REGISTERED
        // but never ready. It is the opposite of a fallback: the active
        // provider stays exactly what PAYMENT_PROVIDER requested, so a
        // not-ready selected provider fails safely.
        if (!config || config.pendingConfiguration === true) {
          config = null;
          isConfigured = false;
        } else {
          // instantiate and validate
          const instance = new ProviderClass(config);
          instance.validateConfig();
          isConfigured = true;
        }
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
