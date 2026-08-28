import QRCode from "qrcode";
import { appendCrc, encodeTlv, parseTlv, validateEmvcoQr, validateNepalQr, QrValidationError } from "./emvco.js";

export async function generateUnifiedQr({ merchantAccountTemplate, merchantName, merchantCity, amount, reference }) {
  const account = parseTlv(merchantAccountTemplate, "merchant account template");
  if (account.length !== 1 || Number(account[0].id) < 26 || Number(account[0].id) > 51) throw new QrValidationError("merchant account template", "must be one acquirer-issued tag 26-51 template");
  if (!/^[A-Za-z0-9._-]{1,25}$/.test(reference || "")) throw new QrValidationError("payment reference", "must be 1-25 safe characters");
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw new QrValidationError("amount", "must be positive");
  const root = [
    encodeTlv("00", "01"), encodeTlv("01", "12"), merchantAccountTemplate,
    encodeTlv("52", "5311"), encodeTlv("53", "524"), encodeTlv("54", numericAmount.toFixed(2)),
    encodeTlv("58", "NP"), encodeTlv("59", merchantName), encodeTlv("60", merchantCity),
    encodeTlv("62", encodeTlv("05", reference)),
  ].join("");
  const qrPayload = appendCrc(root);
  validateEmvcoQr(qrPayload);
  console.info("Generated raw EMVCo test QR payload:", qrPayload);
  return { qrPayload, qrData: await QRCode.toDataURL(qrPayload, { width: 300, margin: 2, errorCorrectionLevel: "M" }) };
}

export { validateEmvcoQr, validateNepalQr, QrValidationError };
