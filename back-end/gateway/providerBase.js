/**
 * PaymentProvider — abstract base for DOKKO payment gateway integrations.
 *
 * Every concrete provider (NepalPay, Mock, …) implements the lifecycle below.
 * The base class throws by default so a missing implementation fails fast.
 *
 * Lifecycle for a digital payment:
 *
 *   createPayment()
 *       ↓  returns a normalised result (QR payload / redirect in metadata)
 *   [customer pays at the provider]
 *       ↓
 *   handleCallback()   — provider calls our webhook (optional)
 *       ↓
 *   verifyPayment()    — we call the provider to confirm
 *       ↓
 *   the payment controller applies the verified result (order → "paid",
 *   settlement created, …) — providers never apply it themselves.
 *
 * ── Provider neutrality ─────────────────────────────────────────
 * The DOKKO payment core (controllers, models, routes, frontend) depends only
 * on the generic contract defined in this file. No NCHL-, NepalPay-,
 * Fonepay-, or other vendor-specific name may appear as a top-level contract
 * field; vendor-specific extras belong in `metadata`.
 *
 * Generic vocabulary shared by every provider result:
 *
 *   provider, flow, merchantReference, providerReference,
 *   providerTransactionId, amountExpected, amountReceived,
 *   status, expiresAt, metadata
 *
 * ── Domain boundaries ───────────────────────────────────────────
 * - Providers RETURN payment results; they never apply them.
 * - A provider must NEVER directly modify orders, settlements, or customer
 *   records. It receives read-only plain objects and returns a normalised
 *   result; the application (payment controller) is solely responsible for
 *   applying verified results (updating the order, creating settlements, …).
 * - `normaliseProviderResult()` converts a provider payload into this
 *   contract so vendor field names never leak into the core.
 *
 * ── Refund ──────────────────────────────────────────────────────
 * Refund is intentionally NOT part of this interface. The current DOKKO
 * architecture has no provider-driven refund flow, so adding a refund method
 * would be speculative abstraction. Add one only when a concrete requirement
 * exists.
 */

/**
 * @typedef {Object} ProviderResult
 * @property {string|null} provider              – provider key (matches the provider map)
 * @property {string|null} flow                  – 'qr' | 'redirect' | 'mock' | provider-defined
 * @property {string|null} merchantReference     – DOKKO reference for this payment attempt
 * @property {string|null} providerReference     – provider-side reference for the request (if any)
 * @property {string|null} providerTransactionId – provider transaction id once payment completes
 * @property {number|null} amountExpected        – server-determined amount sent to the provider (NPR)
 * @property {number|null} amountReceived        – amount the provider reports as paid (NPR)
 * @property {string|null} status                – provider-level status (free-form)
 * @property {Date|string|null} expiresAt        – when this payment request expires
 * @property {Object} metadata                   – provider-specific extras, never generic contract
 */

/** Generic fields that may appear at the top level of a normalised result. */
const GENERIC_FIELD_KEYS = Object.freeze([
  "provider",
  "flow",
  "merchantReference",
  "providerReference",
  "providerTransactionId",
  "amountExpected",
  "amountReceived",
  "status",
  "expiresAt",
]);

/**
 * Legacy generic aliases → canonical generic field.
 * Historically `reference` meant the DOKKO merchant reference and
 * `transactionId` the provider transaction id. These are generic words
 * (not vendor-specific) and are accepted for backward compatibility only.
 */
const LEGACY_ALIASES = Object.freeze({
  reference: "merchantReference",
  transactionId: "providerTransactionId",
});

/**
 * Normalise a provider payload into the generic ProviderResult contract.
 *
 * The DOKKO payment core consumes ONLY the generic fields this function
 * emits; everything else a provider returns is folded into `metadata`.
 * Future and refactored providers should either return the contract shape
 * directly or pass their payload through this helper so NCHL/Fonepay field
 * names never leak into the core.
 *
 * @param {Object} raw                 – provider payload (create / verify / callback)
 * @param {Object} [defaults]          – generic values to fill when raw omits them
 * @param {string} [defaults.provider] – provider key
 * @param {string} [defaults.flow]     – flow key
 * @param {string} [defaults.merchantReference] – DOKKO reference for this attempt
 * @param {number} [defaults.amountExpected]   – expected amount in NPR
 * @param {Object} [defaults.metadata]         – extra metadata root
 * @returns {ProviderResult} a frozen, provider-neutral result
 * @throws {TypeError} when raw is not a plain object
 */
export function normaliseProviderResult(raw, defaults = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError("normaliseProviderResult: raw must be a plain object");
  }

  const canonical = (field, alias = null) => {
    const v = raw[field] ?? (alias ? raw[alias] : undefined) ?? defaults?.[field] ?? null;
    return v === undefined ? null : v;
  };

  const result = {
    provider: canonical("provider"),
    flow: canonical("flow"),
    merchantReference: canonical("merchantReference", "reference"),
    providerReference: canonical("providerReference"),
    providerTransactionId: canonical("providerTransactionId", "transactionId"),
    amountExpected: canonical("amountExpected"),
    amountReceived: canonical("amountReceived"),
    status: canonical("status"),
    expiresAt: canonical("expiresAt"),
  };

  let metadata = {};
  if (defaults.metadata && typeof defaults.metadata === "object" && !Array.isArray(defaults.metadata)) {
    metadata = { ...defaults.metadata };
  }
  if (raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)) {
    metadata = { ...metadata, ...raw.metadata };
  }
  for (const [key, value] of Object.entries(raw)) {
    if (key === "metadata" || key in LEGACY_ALIASES || GENERIC_FIELD_KEYS.includes(key)) continue;
    metadata[key] = value;
  }

  return Object.freeze({ ...result, metadata: Object.freeze(metadata) });
}

export default class PaymentProvider {
  /** @returns {string} provider key — must match paymentModel enum */
  get name() {
    throw new Error("Provider must implement get name()");
  }

  /** @returns {boolean} true when the provider env vars are fully configured */
  get isConfigured() {
    throw new Error("Provider must implement get isConfigured()");
  }

  /**
   * Validate that all required environment variables are present and well-formed.
   * Called once at startup by the config loader.
   * @throws {Error} with a descriptive message when config is invalid
   */
  validateConfig() {
    throw new Error("Provider must implement validateConfig()");
  }

  /**
   * Initiate a payment with the provider.
   *
   * Inputs are read-only — the provider must NEVER mutate the order or
   * customer objects it receives.
   *
   * @param {Object}  opts
   * @param {Object}  opts.order          – order snapshot (read-only: _id, total, items …)
   * @param {Object}  opts.customer       – customer snapshot (read-only: _id, name …)
   * @param {number}  opts.amount         – amount in NPR (server-determined — never trust a client-sent amount)
   * @param {string}  opts.merchantRef    – unique DOKKO reference for this payment attempt
   * @param {string}  [opts.successUrl]   – where to redirect the customer on success
   * @param {string}  [opts.failureUrl]   – where to redirect the customer on failure
   * @returns {Promise<ProviderResult>}
   *   QR payloads, redirect URLs, or any vendor-specific data MUST live in
   *   `metadata` — never as top-level vendor-named fields. Prefer returning
   *   through normaliseProviderResult().
   */
  async createPayment({ order, customer, amount, merchantRef, successUrl, failureUrl }) {
    throw new Error(`${this.name} must implement createPayment()`);
  }

  /**
   * OPTIONAL — generate a QR code payload for the customer to scan.
   * Not all providers support this (some redirect instead); providers that
   * generate their QR via createPayment() should not implement this.
   * @param {Object}  opts                – same as createPayment opts
   * @returns {Promise<{qrData: string, merchantReference: string}>}
   *   `qrData` is the provider's QR content (EMVCo string, image URL, …);
   *   `merchantReference` is the DOKKO reference this QR belongs to.
   */
  async generateQr(opts) {
    throw new Error(`${this.name} does not support QR generation`);
  }

  /**
   * Verify a payment with the provider using their server-side API.
   * Called after we receive a callback, when polling, or when the vendor
   * triggers verification. This is the authoritative confirmation step —
   * never determine success from the client or a redirect.
   *
   * @param {Object}  paymentRecord       – payment document from MongoDB (read-only)
   * @returns {Promise<{verified: boolean, providerReference?: string, providerTransactionId?: string, amountReceived?: number, status?: string, metadata?: Object}>}
   *   A normalised, provider-neutral result (see normaliseProviderResult).
   */
  async verifyPayment(paymentRecord) {
    throw new Error(`${this.name} must implement verifyPayment()`);
  }

  /**
   * OPTIONAL — check the current status of a payment with the provider.
   * Not every provider supports a standalone status query; the DOKKO core
   * relies on verifyPayment() for confirmation. Providers that support it
   * should override this method.
   *
   * @param {Object}  paymentRecord       – payment document from MongoDB (read-only)
   * @returns {Promise<{status: string, metadata?: Object}>}
   */
  async getPaymentStatus(paymentRecord) {
    throw new Error(`${this.name} must implement getPaymentStatus()`);
  }

  /**
   * OPTIONAL — process an incoming callback / webhook from the provider.
   * The provider calls this when the customer has paid. Extract the relevant
   * data and return a normalised result (see normaliseProviderResult). At
   * minimum it must include providerTransactionId, amountReceived and
   * merchantReference so the controller can confirm the payment.
   *
   * @param {Object}  req                 – Express request (or raw body for webhooks)
   * @returns {Promise<{providerTransactionId?: string, amountReceived?: number, merchantReference: string, metadata?: Object}>}
   */
  async handleCallback(req) {
    throw new Error(`${this.name} must implement handleCallback()`);
  }

  /**
   * Validate that the amount the provider reports matches what we expect.
   * @param {number}  expected
   * @param {number}  received
   * @returns {boolean}
   */
  validateAmount(expected, received) {
    return Number(expected) === Number(received);
  }

  /**
   * Validate a merchant reference string format.
   * @param {string}  reference
   * @returns {boolean}
   */
  validateReference(reference) {
    return typeof reference === "string" && reference.trim().length > 0;
  }
}