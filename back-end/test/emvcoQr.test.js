import assert from "node:assert/strict";
import { appendCrc, crc16CcittFalse, encodeTemplate, encodeTlv, parseTlv, validateEmvcoQr, validateNepalQr, QrValidationError } from "../gateway/emvco.js";
import { generateUnifiedQr } from "../gateway/unifiedQr.js";
import NepalpayProvider from "../gateway/nepalpayProvider.js";
import MockProvider from "../gateway/mockProvider.js";

let passed = 0;
async function test(name, fn) { await fn(); passed += 1; console.log(`✓ ${name}`); }
function fails(fn, part) { assert.throws(fn, (error) => error instanceof QrValidationError && error.message.includes(part)); }

const template = encodeTemplate("26", [{ id: "00", value: "com.dokko.test" }, { id: "01", value: "TEST-MERCHANT" }]);
const build = (reference = "DKO-A-123") => generateUnifiedQr({ merchantAccountTemplate: template, merchantName: "DOKKO TEST", merchantCity: "Kathmandu", amount: 115, reference });

await test("TLV encoding calculates lengths", () => assert.equal(encodeTlv("59", "DOKKO"), "5905DOKKO"));
await test("TLV decoding round-trips nested template", () => assert.equal(parseTlv(parseTlv(template)[0].value)[1].value, "TEST-MERCHANT"));
await test("CRC-16/CCITT-FALSE known vector", () => assert.equal(crc16CcittFalse("123456789"), "29B1"));
const result = await build();
await test("generates valid dynamic EMVCo payload", () => assert.doesNotThrow(() => validateEmvcoQr(result.qrPayload)));
await test("amount appears before country and additional data", () => { const ids = parseTlv(result.qrPayload).map(({ id }) => id); assert.ok(ids.indexOf("54") < ids.indexOf("58") && ids.indexOf("54") < ids.indexOf("62")); });
await test("CRC field is final and valid", () => assert.equal(parseTlv(result.qrPayload).at(-1).id, "63"));
await test("modification fails CRC validation", () => fails(() => validateEmvcoQr(result.qrPayload.replace("115.00", "116.00")), "CRC mismatch"));
await test("malformed TLV is rejected", () => fails(() => parseTlv("0002015909DOKKO"), "declared length"));
await test("HTML entity is rejected", () => fails(() => encodeTlv("59", "DOKKO&#x20;"), "unsupported HTML"));
await test("incorrect root ordering is rejected", () => { const fields = parseTlv(result.qrPayload).filter(({ id }) => id !== "63"); const moved = [...fields.filter(({ id }) => id !== "54"), fields.find(({ id }) => id === "54")].map(({ id, value }) => encodeTlv(id, value)).join(""); fails(() => validateEmvcoQr(appendCrc(moved)), "out of order"); });
await test("missing mandatory field is rejected", () => { const missing = parseTlv(result.qrPayload).filter(({ id }) => !["54", "63"].includes(id)).map(({ id, value }) => encodeTlv(id, value)).join(""); fails(() => validateEmvcoQr(appendCrc(missing)), "mandatory field missing"); });
await test("NepalQR validation remains explicitly pending", () => assert.equal(validateNepalQr(result.qrPayload).status, "NEPALQR_NETWORK_VALIDATION_PENDING"));
await test("missing official merchant configuration is rejected", () => assert.throws(() => new NepalpayProvider({ mode: "real" }).validateConfig(), /configuration is incomplete/));
await test("references distinguish two DOKKO payment records", async () => assert.notEqual(result.qrPayload, (await build("DKO-B-456")).qrPayload));
await test("development mock verifies only its server-derived transaction reference", async () => { const mock = new MockProvider({ enabled: true }); const payment = { merchantReference: "MOCK-REF", amountExpected: 10, providerTransactionId: "MOCK-MOCK-REF" }; assert.equal((await mock.verifyPayment(payment)).verified, true); });
await test("production rejects mock provider", () => { const prior = process.env.NODE_ENV; process.env.NODE_ENV = "production"; assert.throws(() => new MockProvider({ enabled: true }).validateConfig(), /only when NODE_ENV/); if (prior === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prior; });
console.log(`${passed} QR tests passed`);
