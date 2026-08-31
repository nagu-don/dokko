/**
 * NCHL NEPALPAY QR Generation API integration.
 *
 * Implements the official NCHL Merchant QR Generation endpoint:
 *   POST /qr/generateQR
 *
 * This module is the ONLY place in the production codebase that
 * constructs NCHL API requests. The production application must NOT
 * manually construct QR payloads — NCHL is authoritative.
 *
 * Reference: https://doc.connectips.com/docs/NepalPAY-QR/Merchant-QR-generation/introduction
 */

import crypto from "node:crypto";
import { readFileSync } from "node:fs";

// ── Token construction ─────────────────────────────────────────
// NCHL documentation for dynamic QR (pointOfInitialization = 12):
//
//   TokenString = acquirerId + ", " + merchantId + ", "
//     + merchantCategoryCode + ", " + transactionCurrency + ", "
//     + transactionAmount + ", " + billNumber + ", " + userId
//
// The separator is exactly ", " (comma + space).
// Do NOT modify this format.

/**
 * Build the exact token string for dynamic QR per NCHL specification.
 *
 * @param {Object}  opts
 * @param {string}  opts.acquirerId
 * @param {string}  opts.merchantId
 * @param {number|string}  opts.merchantCategoryCode
 * @param {number|string}  opts.transactionCurrency
 * @param {string}  opts.transactionAmount  — formatted as "123.45"
 * @param {string}  opts.billNumber
 * @param {string}  opts.userId
 * @returns {string}
 */
export function buildNepalPayDynamicQrTokenString({
  acquirerId,
  merchantId,
  merchantCategoryCode,
  transactionCurrency,
  transactionAmount,
  billNumber,
  userId,
}) {
  return [
    acquirerId,
    merchantId,
    merchantCategoryCode,
    transactionCurrency,
    transactionAmount,
    billNumber,
    userId,
  ].join(", ");
}

// ── RSA signing ────────────────────────────────────────────────
// NCHL specifies:
//   1. SHA-256 message digest of the token string
//   2. Sign with digital certificate private key (SHA256withRSA)
//   3. Base64-encode the signature
//   4. Place in "token" field of the request

/**
 * Sign the token string using SHA256withRSA.
 *
 * @param {string}  tokenString  — the raw token string to sign
 * @param {string|Buffer}  privateKey  — PEM private key or PFX/P12 buffer
 * @param {string}  [pfxPassword]  — password if privateKey is a PFX buffer
 * @returns {string}  Base64-encoded signature
 */
export function signNepalPayToken(tokenString, privateKey, pfxPassword) {
  let keyInput;

  if (Buffer.isBuffer(privateKey)) {
    // PFX/P12 — extract the private key
    const parsed = crypto.createPrivateKey({
      key: privateKey,
      format: "der",
      type: "pkcs12",
      passphrase: pfxPassword || "",
    });
    keyInput = parsed;
  } else if (typeof privateKey === "string") {
    // PEM string
    keyInput = { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING };
  } else {
    throw new Error("signNepalPayToken: privateKey must be a PEM string or PFX Buffer");
  }

  const sign = crypto.createSign("SHA256");
  sign.update(tokenString, "utf8");
  sign.end();

  const signature = sign.sign(keyInput);
  return signature.toString("base64");
}

// ── Basic Auth header ──────────────────────────────────────────

/**
 * Build the HTTP Basic Auth header value.
 *
 * @param {string}  username
 * @param {string}  password
 * @returns {string}  "Basic <base64(username:password)>"
 */
export function buildBasicAuthHeader(username, password) {
  const encoded = Buffer.from(`${username}:${password}`, "utf8").toString("base64");
  return `Basic ${encoded}`;
}

// ── NCHL QR Generation API ─────────────────────────────────────

/**
 * Call the NCHL POST /qr/generateQR endpoint.
 *
 * @param {Object}  opts
 * @param {string}  opts.baseUrl        — e.g. "https://nchl.com.np"
 * @param {string}  opts.username       — NCHL API username
 * @param {string}  opts.password       — NCHL API password
 * @param {string}  opts.acquirerId
 * @param {string}  opts.merchantId
 * @param {string}  opts.merchantName
 * @param {number}  opts.merchantCategoryCode
 * @param {string}  opts.merchantCity
 * @param {string}  opts.merchantCountry
 * @param {string}  opts.merchantPostalCode
 * @param {string}  opts.merchantLanguage
 * @param {number}  opts.transactionCurrency
 * @param {string}  opts.transactionAmount    — "123.45"
 * @param {string}  opts.valueOfConvenienceFeeFixed — "0.00"
 * @param {string}  opts.billNumber
 * @param {string}  opts.storeLabel
 * @param {string}  opts.terminalLabel
 * @param {string}  opts.purposeOfTransaction
 * @param {string}  opts.userId              — NPI user ID
 * @param {Buffer|string}  opts.privateKey    — PFX buffer or PEM string
 * @param {string}  opts.pfxPassword
 * @param {boolean} [opts.qrImage=false]
 * @param {number}  [opts.timeoutMs=15000]
 * @returns {Promise<Object>}  NCHL response data
 * @throws {Error} with .code, .nchlResponse on API errors
 */
export async function generateNchlQr({
  baseUrl,
  username,
  password,
  acquirerId,
  merchantId,
  merchantName,
  merchantCategoryCode,
  merchantCity,
  merchantCountry = "NP",
  merchantPostalCode = "4600",
  merchantLanguage = "en",
  transactionCurrency = 524,
  transactionAmount,
  valueOfConvenienceFeeFixed = "0.00",
  billNumber = "0",
  storeLabel,
  terminalLabel = "Terminal1",
  purposeOfTransaction = "Bill payment",
  userId,
  privateKey,
  pfxPassword,
  qrImage = false,
  timeoutMs = 15000,
}) {
  // ── 1. Build token string ──────────────────────────────────
  const tokenString = buildNepalPayDynamicQrTokenString({
    acquirerId,
    merchantId,
    merchantCategoryCode,
    transactionCurrency,
    transactionAmount,
    billNumber,
    userId,
  });

  // ── 2. Sign token ──────────────────────────────────────────
  const token = signNepalPayToken(tokenString, privateKey, pfxPassword);

  // ── 3. Build request body ──────────────────────────────────
  const body = {
    pointOfInitialization: 12,
    acquirerId,
    merchantId,
    merchantName,
    merchantCategoryCode,
    merchantCountry,
    merchantCity,
    merchantPostalCode,
    merchantLanguage,
    transactionCurrency,
    transactionAmount,
    valueOfConvenienceFeeFixed,
    billNumber,
    referenceLabel: null,
    mobileNo: null,
    storeLabel,
    terminalLabel,
    purposeOfTransaction,
    additionalConsumerDataRequest: null,
    loyaltyNumber: null,
    qrImage,
    token,
  };

  // ── 4. HTTP request ────────────────────────────────────────
  const url = `${baseUrl.replace(/\/+$/, "")}/qr/generateQR`;
  const authHeader = buildBasicAuthHeader(username, password);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (fetchErr) {
    clearTimeout(timer);
    const message = fetchErr.name === "AbortError"
      ? `NCHL QR request timed out after ${timeoutMs}ms`
      : `NCHL QR request failed: ${fetchErr.message}`;
    const err = new Error(message);
    err.code = "NCHL_NETWORK_ERROR";
    throw err;
  } finally {
    clearTimeout(timer);
  }

  // ── 5. Parse response ──────────────────────────────────────
  let data;
  try {
    data = await response.json();
  } catch {
    const err = new Error(`NCHL returned non-JSON response (HTTP ${response.status})`);
    err.code = "NCHL_MALFORMED_RESPONSE";
    err.httpStatus = response.status;
    throw err;
  }

  // ── 6. Check HTTP status ──────────────────────────────────
  if (!response.ok) {
    const err = new Error(
      data.responseMessage || `NCHL HTTP error ${response.status}`
    );
    err.code = data.responseCode || `NCHL_HTTP_${response.status}`;
    err.nchlResponse = data;
    err.httpStatus = response.status;
    throw err;
  }

  // ── 7. Check NCHL response code ───────────────────────────
  if (data.responseCode !== "000" || data.responseStatus !== "SUCCESS") {
    const err = new Error(
      data.responseMessage || "NCHL QR generation failed"
    );
    err.code = data.responseCode;
    err.nchlResponse = data;
    err.httpStatus = response.status;
    throw err;
  }

  // ── 8. Validate required data ──────────────────────────────
  if (!data.data?.validationTraceId || !data.data?.qrString) {
    const err = new Error("NCHL response missing validationTraceId or qrString");
    err.code = "NCHL_INCOMPLETE_RESPONSE";
    err.nchlResponse = data;
    throw err;
  }

  return data;
}

// ── Helpers ────────────────────────────────────────────────────

/**
 * Load a PFX/P12 certificate file from disk.
 *
 * @param {string}  filePath  — absolute path to the .pfx / .p12 file
 * @returns {Buffer}
 */
export function loadPfxCertificate(filePath) {
  return readFileSync(filePath);
}

/**
 * Format an amount to exactly 2 decimal places for NCHL.
 *
 * @param {number}  amount
 * @returns {string}  e.g. "115.00"
 */
export function formatAmount(amount) {
  const num = Number(amount);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`Invalid amount for NCHL QR: ${amount}`);
  }
  return num.toFixed(2);
}
