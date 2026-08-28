import PaymentProvider from "./providerBase.js";

export default class MockProvider extends PaymentProvider {
  #config;
  constructor(config) { super(); this.#config = Object.freeze({ ...config }); }
  get name() { return "mock"; }
  get isConfigured() { return this.#config.enabled === true; }
  validateConfig() { if (!this.#config.enabled || process.env.NODE_ENV === "production") throw new Error("Mock payment provider is available only when NODE_ENV is not production and MOCK_PAYMENT_ENABLED=true"); }
  async createPayment({ merchantRef }) { this.validateConfig(); return { flow: "mock", mockReference: merchantRef, qrReference: merchantRef, expiresAt: new Date(Date.now() + 15 * 60 * 1000) }; }
  async verifyPayment(payment) { this.validateConfig(); return { verified: payment.providerTransactionId === `MOCK-${payment.merchantReference}`, amountReceived: payment.amountExpected, transactionId: payment.providerTransactionId, raw: { provider: "mock" } }; }
  async getPaymentStatus() { return { status: "awaiting_payment" }; }
  async handleCallback(req) { this.validateConfig(); const payment = req.payment; return { providerTransactionId: `MOCK-${payment.merchantReference}`, amountReceived: payment.amountExpected, reference: payment.merchantReference, raw: { provider: "mock", simulated: true } }; }
}
