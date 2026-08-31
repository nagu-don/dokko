/**
 * Payment Gateway — public API for the rest of the backend.
 *
 * Usage:
 *   import { getProvider, loadGateway } from "./gateway/index.js";
 *
 *   // call once at startup (after dotenv/config)
 *   const gatewayReady = loadGateway();
 *
 *   // use in controllers / routes
 *   const provider = getProvider();
 *   await provider.createPayment({ ... });
 *
*  SECURITY:
 *   - Provider secrets live only in config objects, never exported.
 *   - The provider instance is created server-side; the frontend
 *     receives only redirect URLs or QR payloads — never secrets.
 *   - Never trust payment success from the client; always call
 *     verifyPayment() on the server.
 *
 *  CONTRACT:
 *   - The payment core consumes only the generic ProviderResult fields
 *     (provider, flow, merchantReference, providerReference,
 *     providerTransactionId, amountExpected, amountReceived, status,
 *     expiresAt, metadata). Provider-specific extras always live in
 *     `metadata` — see normaliseProviderResult().
 *   - Providers return payment results; they never modify orders,
 *     settlements, or customer records.
 */

import { loadProviders, createActiveProvider, isActiveProviderReady } from "./config.js";

// ── Module-level state ─────────────────────────────────────────
let _providerConfig = null;
let _providerInstance = null;
const _providerInstances = new Map();

/**
 * Load and validate the payment gateway configuration.
 * Call this once at application startup.
 *
 * @param {Object} [envOverride] — optional env for testing
 * @returns {Object} the loaded provider config
 * @throws {Error} if PAYMENT_PROVIDER or COMPANY_BANK_ACCOUNT is invalid
 */
export function loadGateway(envOverride) {
  _providerConfig = loadProviders(envOverride);
  _providerInstance = null; // reset so getProvider() re-creates
  _providerInstances.clear();
  return _providerConfig;
}

/**
 * Get a singleton instance of the active payment provider.
 * Creates and validates the instance on first call.
 *
 * @returns {PaymentProvider}
 * @throws {Error} if gateway is not loaded or provider is not configured
 */
export function getProvider() {
  if (!_providerConfig) {
    throw new Error("Payment gateway not initialised. Call loadGateway() first.");
  }

  if (!_providerInstance) {
    _providerInstance = createActiveProvider(_providerConfig);
  }

  return _providerInstance;
}

/**
 * Get a provider instance by name (e.g. "mock" or "fonepay").
 * Each named instance is cached after first creation.
 *
 * @param {string} name — provider key
 * @returns {PaymentProvider}
 * @throws {Error} if gateway not loaded, provider unknown, or not configured
 */
export function getProviderByName(name) {
  if (!_providerConfig) {
    throw new Error("Payment gateway not initialised. Call loadGateway() first.");
  }

  if (_providerInstances.has(name)) {
    return _providerInstances.get(name);
  }

  const entry = _providerConfig.providers[name];
  if (!entry) {
    throw new Error(`Unknown payment provider "${name}"`);
  }
  if (!entry.isConfigured) {
    throw new Error(`Payment provider "${name}" is not configured (missing env vars)`);
  }

  const instance = new entry.ProviderClass(entry.config);
  _providerInstances.set(name, instance);
  return instance;
}

/**
 * Get the active provider name and configuration summary.
 * Does NOT expose secrets — returns only metadata.
 *
 * @returns {{ activeProvider: string, isReady: boolean, availableProviders: string[] }}
 */
export function getGatewayStatus() {
  if (!_providerConfig) {
    return { activeProvider: null, isReady: false, availableProviders: [] };
  }

  return {
    activeProvider: _providerConfig.activeProvider,
    isReady: isActiveProviderReady(_providerConfig),
    availableProviders: Object.keys(_providerConfig.providers).filter(
      (name) => _providerConfig.providers[name].isConfigured
    ),
  };
}

/**
 * Get the company bank account (for internal use only).
 * Do NOT expose this to customers or vendors.
 *
 * @returns {string}
 */
export function getCompanyBankAccount() {
  if (!_providerConfig) {
    throw new Error("Payment gateway not initialised. Call loadGateway() first.");
  }
  return _providerConfig.companyBankAccount;
}

export {
  loadProviders,
  createActiveProvider,
  isActiveProviderReady,
} from "./config.js";

export { default as PaymentProvider, normaliseProviderResult } from "./providerBase.js";
