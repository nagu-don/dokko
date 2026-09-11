import PaymentProvider from "./providerBase.js";
import { generateNchlQr, loadPfxCertificate, formatAmount } from "./nchlApi.js";
import { validateEmvcoQr } from "./emvco.js";
import logger from "../utils/logger.js";

export default class NepalpayProvider extends PaymentProvider {
  #config;
  constructor(config) { super(); this.#config = Object.freeze({ ...config }); }
  get name() { return "nepalpay"; }
  get isConfigured() { return Boolean(this.#config.apiBaseUrl && this.#config.apiUsername && this.#config.acquirerId && this.#config.merchantId && this.#config.userId && this.#config.pfxPath); }

  validateConfig() {
    const required = [
      ["NEPALPAY_QR_BASE_URL", this.#config.apiBaseUrl],
      ["NEPALPAY_API_USERNAME", this.#config.apiUsername],
      ["NEPALPAY_API_PASSWORD", this.#config.apiPassword],
      ["NEPALPAY_ACQUIRER_ID", this.#config.acquirerId],
      ["NEPALPAY_MERCHANT_ID", this.#config.merchantId],
      ["NEPALPAY_USER_ID", this.#config.userId],
      ["NEPALPAY_PFX_PATH", this.#config.pfxPath],
    ];
    const missing = required.filter(([, value]) => !value).map(([name]) => name);
    if (missing.length) {
      throw new Error(`NEPALPAY/NCHL payment configuration is incomplete. Missing: ${missing.join(", ")}. These are provisioned by NCHL/acquirer onboarding.`);
    }
    if (!this.#config.pfxPath || !this.#config.apiBaseUrl) {
      throw new Error("NEPALPAY/NCHL payment configuration is incomplete. An acquiring-bank/NCHL merchant configuration and signing certificate are required.");
    }
  }

  async createPayment({ amount, merchantRef }) {
    this.validateConfig();

    // ── 1. Determine authoritative amount ────────────────────
    const transactionAmount = formatAmount(amount);

    // ── 2. PFX signing certificate ───────────────────────────
    const pfxBuffer = loadPfxCertificate(this.#config.pfxPath);

    // ── 3. Call NCHL POST /qr/generateQR ─────────────────────
    logger.info({
      paymentId: merchantRef,
      merchantReference: merchantRef,
      transactionAmount,
    }, "NEPALPAY QR generation started");

    try {
      const response = await generateNchlQr({
        baseUrl: this.#config.apiBaseUrl,
        username: this.#config.apiUsername,
        password: this.#config.apiPassword,
        acquirerId: this.#config.acquirerId,
        merchantId: this.#config.merchantId,
        merchantName: this.#config.merchantName,
        merchantCategoryCode: this.#config.merchantCategoryCode,
        merchantCity: this.#config.merchantCity,
        merchantCountry: this.#config.merchantCountry,
        merchantPostalCode: this.#config.merchantPostalCode,
        merchantLanguage: this.#config.merchantLanguage,
        transactionCurrency: 524,
        transactionAmount,
        valueOfConvenienceFeeFixed: "0.00",
        billNumber: merchantRef,
        storeLabel: this.#config.storeLabel,
        terminalLabel: this.#config.terminalLabel,
        userId: this.#config.userId,
        privateKey: pfxBuffer,
        pfxPassword: this.#config.pfxPassword,
        qrImage: false,
      });

      const { validationTraceId, qrString } = response.data;

      logger.info({
        responseCode: response.responseCode,
        responseStatus: response.responseStatus,
        validationTraceId,
        merchantReference: merchantRef,
      }, "NEPALPAY QR generation succeeded");

      return {
        flow: "qr",
        qrReference: merchantRef,
        validationTraceId,
        qrString,
        nchlResponseCode: response.responseCode,
        nchlResponseMessage: response.responseMessage,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      };
    } catch (err) {
      logger.error({
        err,
        responseCode: err.code,
        merchantReference: merchantRef,
      }, "NEPALPAY QR generation failed");
      throw err;
    }
  }

  /**
   * Server-side verification against NCHL is not performed by the QR
   * generation API. Real verification relies on the NCHL verification /
   * reporting mechanism (transaction query / webhook). This placeholder
   * reports verification pending for local EMVCo structural validation
   * only; it is never used to mark a payment as verified.
   */
  async verifyPayment(paymentRecord) {
    return { verified: false, raw: { status: "NEPALQR_NETWORK_VALIDATION_PENDING", reason: "NCHL transaction verification must be confirmed via the official payment reporting mechanism." } };
  }

  async getPaymentStatus(paymentRecord) {
    if (!paymentRecord) return { status: "awaiting_payment" };
    if (paymentRecord.status === "payment_verified") return { status: "payment_verified" };
    return { status: "awaiting_payment" };
  }

  /**
   * Structural validation of a QR string returned by NCHL.
   * Diagnostic-only: NEVER modifies or repairs the QR. If the returned
   * QR fails validation, it must not be shown to the customer.
   *
   * @param {string} qrString  — the raw qrString returned by NCHL
   * @returns {{ valid: boolean, error?: string }}
   */
  validateReturnedQr(qrString) {
    try {
      validateEmvcoQr(qrString);
      return { valid: true };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }
}
