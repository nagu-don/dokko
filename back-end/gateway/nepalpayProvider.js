import PaymentProvider from "./providerBase.js";
import { generateUnifiedQr } from "./unifiedQr.js";

export default class NepalpayProvider extends PaymentProvider {
  #config;
  constructor(config) { super(); this.#config = Object.freeze({ ...config }); }
  get name() { return "nepalpay"; }
  get isConfigured() { return Boolean(this.#config.mode && this.#config.merchantAccountTemplate); }
  validateConfig() {
    if (!this.#config.merchantAccountTemplate) throw new Error("NEPALPAY/NCHL payment configuration is incomplete. An acquiring-bank/NCHL merchant configuration is required.");
    if (!["real", "emvco_test"].includes(this.#config.mode)) throw new Error("NEPALPAY_MODE must be real or emvco_test");
  }
  async createPayment({ amount, merchantRef }) {
    this.validateConfig();
    const result = await generateUnifiedQr({ merchantAccountTemplate: this.#config.merchantAccountTemplate, merchantName: this.#config.merchantName, merchantCity: this.#config.merchantCity, amount, reference: merchantRef });
    return { ...result, qrReference: merchantRef, flow: "qr", isEmvcoTest: this.#config.mode === "emvco_test", expiresAt: new Date(Date.now() + 15 * 60 * 1000) };
  }
  async verifyPayment() { return { verified: false, raw: { status: "NEPALQR_NETWORK_VALIDATION_PENDING" } }; }
  async getPaymentStatus() { return { status: "awaiting_payment" }; }
}
