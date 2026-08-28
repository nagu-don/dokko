/**
 * PaymentProvider — abstract base for payment gateway integrations.
 *
 * Every concrete provider (NepalPay, Mock, …) must implement these methods.
 * The base class throws by default so a missing implementation fails fast.
 *
 * Lifecycle for a digital payment:
 *
 *   createPayment()
 *       ↓  (returns redirect URL or QR payload)
 *   [customer pays]
 *       ↓
 *   handleCallback()   — provider calls our webhook
 *       ↓
 *   verifyPayment()    — we call the provider to confirm
 *       ↓
 *   status transitions to "payment_verified"
 */

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
   * @param {Object}  opts
   * @param {Object}  opts.order          – order document (or plain object with _id, total, items …)
   * @param {Object}  opts.customer       – customer document (or plain object with _id, name …)
   * @param {number}  opts.amount         – amount in NPR (server-determined)
   * @param {string}  opts.merchantRef    – unique reference for this payment attempt
   * @param {string}  [opts.successUrl]   – where to redirect the customer on success
   * @param {string}  [opts.failureUrl]   – where to redirect the customer on failure
   * @returns {Promise<Object>}  provider-specific payload (redirectUrl, qrData, …)
   */
  async createPayment({ order, customer, amount, merchantRef, successUrl, failureUrl }) {
    throw new Error(`${this.name} must implement createPayment()`);
  }

  /**
   * Generate a QR code payload for the customer to scan.
   * Not all providers support this — some redirect instead.
   * @param {Object}  opts                – same as createPayment opts
   * @returns {Promise<{qrData: string, reference: string}>}
   */
  async generateQr(opts) {
    throw new Error(`${this.name} does not support QR generation`);
  }

  /**
   * Verify a payment with the provider using their server-side API.
   * Called after we receive a callback or when polling for status.
   * @param {Object}  paymentRecord       – payment document from MongoDB
   * @returns {Promise<{verified: boolean, amountReceived?: number, transactionId?: string}>}
   */
  async verifyPayment(paymentRecord) {
    throw new Error(`${this.name} must implement verifyPayment()`);
  }

  /**
   * Check the current status of a payment with the provider.
   * @param {Object}  paymentRecord       – payment document from MongoDB
   * @returns {Promise<{status: string, raw?: Object}>}
   */
  async getPaymentStatus(paymentRecord) {
    throw new Error(`${this.name} must implement getPaymentStatus()`);
  }

  /**
   * Process an incoming callback / webhook from the provider.
   * Should extract the relevant data and return a normalised shape.
   * @param {Object}  req                 – Express request (or raw body for webhooks)
   * @returns {Promise<{providerTransactionId: string, amountReceived: number, reference: string, raw: Object}>}
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
   * Validate a payment reference string format.
   * @param {string}  reference
   * @returns {boolean}
   */
  validateReference(reference) {
    return typeof reference === "string" && reference.trim().length > 0;
  }
}
