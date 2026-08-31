import PaymentProvider from "./providerBase.js";

/**
 * Fonepay (Dynamic QR) provider — SAFE BOUNDARY ONLY.
 *
 * STATUS: CONFIGURATION PENDING / NOT_IMPLEMENTED.
 *
 * Official Fonepay credentials and API parameters are NOT documented in this
 * project, so this provider is a strict boundary that is NEVER ready:
 *
 *   - `isConfigured` is always false;
 *   - `validateConfig()` always throws;
 *   - `createPayment()`, `verifyPayment()`, `getPaymentStatus()`,
 *     `handleCallback()` and `generateQr()` all throw a dedicated
 *     FONEPAY_NOT_CONFIGURED error;
 *   - `createActiveProvider()` / `getProvider()` therefore fail until the
 *     official documentation is supplied and the real configuration
 *     boundary is implemented as a genuine API call.
 *
 * ── Hard prohibition (enforced) ─────────────────────────────────
 * This provider NEVER constructs a Fonepay QR (or any EMVCo TLV, CRC,
 * merchant template, or payload) locally, and it NEVER returns an EMVCo QR
 * labelled as Fonepay. No payment initiation produces any QR or payload
 * content until a real, verified Fonepay API integration exists. There is
 * nothing here to fabricate with — the QR-generation methods are guarded to
 * throw before any payload can be produced.
 *
 * Deliberately NOT a fallback: when PAYMENT_PROVIDER=fonepay the gateway
 * activates Fonepay (activeProvider === "fonepay") and reports isReady=false;
 * it never silently switches to another provider.
 */

/** Dedicated, stable error used for the Fonepay safe boundary. */
export class FonepayNotConfiguredError extends Error {
  constructor(message = "FONEPAY_NOT_CONFIGURED") {
    super(message);
    this.name = "FonepayNotConfiguredError";
    this.code = "FONEPAY_NOT_CONFIGURED";
  }
}

export default class FonepayProvider extends PaymentProvider {
  get name() { return "fonepay"; }
  get isConfigured() { return false; }

  validateConfig() {
    throw new FonepayNotConfiguredError(
      "FONEPAY_NOT_CONFIGURED: official Fonepay credentials/API parameters are not documented yet, so no Fonepay (Dynamic QR) integration exists. No QR is generated. Add the FONEPAY_* environment variables and a verified Fonepay API call once the official documentation is supplied.",
    );
  }

  /**
   * Never fabricates a Fonepay QR locally. Throws until a real verified
   * Fonepay API integration is implemented.
   */
  async createPayment() {
    throw new FonepayNotConfiguredError(
      "FONEPAY_NOT_CONFIGURED: Fonepay (Dynamic QR) payment initiation is not implemented. Official Fonepay API documentation/credentials are required. No homemade QR is produced.",
    );
  }

  /** Explicitly disable any local QR generation for Fonepay. */
  async generateQr() {
    throw new FonepayNotConfiguredError(
      "FONEPAY_NOT_CONFIGURED: Fonepay QR generation is not implemented and is disabled. No homemade/EMVCo QR is produced. Waiting on official Fonepay API documentation.",
    );
  }

  async verifyPayment() {
    throw new FonepayNotConfiguredError(
      "FONEPAY_NOT_CONFIGURED: Fonepay verification is not implemented. Official Fonepay API documentation/credentials are required.",
    );
  }

  async getPaymentStatus() {
    throw new FonepayNotConfiguredError(
      "FONEPAY_NOT_CONFIGURED: Fonepay status query is not implemented. Official Fonepay API documentation/credentials are required.",
    );
  }

  async handleCallback() {
    throw new FonepayNotConfiguredError(
      "FONEPAY_NOT_CONFIGURED: Fonepay callback handling is not implemented. Official Fonepay API documentation/credentials are required.",
    );
  }
}
