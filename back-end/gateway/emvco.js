const TAG = /^\d{2}$/;
const FORBIDDEN = /(?:&#x[0-9a-f]+;|&#\d+;|[&<>]|[\r\n\t])/i;
const ROOT_ORDER = ["00", "01", ...Array.from({ length: 26 }, (_, i) => String(i + 26).padStart(2, "0")), "52", "53", "54", "55", "56", "57", "58", "59", "60", "61", "62", "63"];

export class QrValidationError extends Error {
  constructor(field, message) { super(`${field}: ${message}`); this.name = "QrValidationError"; this.field = field; }
}

function safeString(value, field) {
  if (typeof value !== "string" || !value) throw new QrValidationError(field, "must be a non-empty string");
  if (FORBIDDEN.test(value) || Buffer.byteLength(value, "utf8") !== value.length) throw new QrValidationError(field, "contains unsupported HTML, control, or non-ASCII characters");
}

export function encodeTlv(id, value) {
  if (!TAG.test(id)) throw new QrValidationError("tag", "must be two decimal digits");
  safeString(value, `tag ${id}`);
  if (value.length > 99) throw new QrValidationError(`tag ${id}`, "value exceeds 99 characters");
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

export function encodeTemplate(id, fields) {
  if (!Array.isArray(fields) || !fields.length) throw new QrValidationError(`tag ${id}`, "nested template must contain fields");
  return encodeTlv(id, fields.map(({ id: childId, value }) => encodeTlv(childId, value)).join(""));
}

export function parseTlv(payload, field = "payload") {
  safeString(payload, field);
  const fields = [];
  for (let offset = 0; offset < payload.length;) {
    if (offset + 4 > payload.length) throw new QrValidationError(field, `truncated header at ${offset}`);
    const id = payload.slice(offset, offset + 2); const lengthText = payload.slice(offset + 2, offset + 4);
    if (!TAG.test(id) || !/^\d{2}$/.test(lengthText)) throw new QrValidationError(field, `invalid header at ${offset}`);
    const length = Number(lengthText); const end = offset + 4 + length;
    if (end > payload.length) throw new QrValidationError(`tag ${id}`, "declared length exceeds remaining payload");
    fields.push({ id, length, value: payload.slice(offset + 4, end), offset }); offset = end;
  }
  return fields;
}

export function crc16CcittFalse(value) {
  let crc = 0xffff;
  for (const byte of Buffer.from(value, "ascii")) { crc ^= byte << 8; for (let i = 0; i < 8; i += 1) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff; }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function appendCrc(payloadWithoutCrc) { return `${payloadWithoutCrc}6304${crc16CcittFalse(`${payloadWithoutCrc}6304`)}`; }

export function validateEmvcoQr(payload) {
  const fields = parseTlv(payload); const ids = fields.map((field) => field.id);
  if (new Set(ids).size !== ids.length) throw new QrValidationError("payload", "duplicate root tag");
  if (ids.at(-1) !== "63") throw new QrValidationError("tag 63", "CRC must be final");
  const crc = fields.at(-1);
  if (crc.length !== 4 || !/^[0-9A-F]{4}$/.test(crc.value) || crc16CcittFalse(payload.slice(0, crc.offset + 4)) !== crc.value) throw new QrValidationError("tag 63", "CRC mismatch");
  for (let i = 1; i < ids.length; i += 1) if (ROOT_ORDER.indexOf(ids[i - 1]) >= ROOT_ORDER.indexOf(ids[i])) throw new QrValidationError("root order", `${ids[i]} is out of order`);
  const byId = new Map(fields.map((field) => [field.id, field]));
  for (const tag of ["00", "01", "52", "53", "54", "58", "59", "60", "63"]) if (!byId.has(tag)) throw new QrValidationError(`tag ${tag}`, "mandatory field missing");
  if (!fields.some(({ id }) => Number(id) >= 26 && Number(id) <= 51)) throw new QrValidationError("merchant account", "template tag 26-51 is required");
  if (byId.get("00").value !== "01" || byId.get("01").value !== "12") throw new QrValidationError("initiation", "only dynamic EMVCo QR (00=01, 01=12) is accepted");
  if (byId.get("53").value !== "524" || byId.get("58").value !== "NP") throw new QrValidationError("currency/country", "must be NPR (524) and NP");
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(byId.get("54").value)) throw new QrValidationError("tag 54", "invalid amount");
  if (byId.get("59").value.length > 25 || byId.get("60").value.length > 15) throw new QrValidationError("merchant details", "name/city exceed EMVCo limits");
  for (const template of fields.filter(({ id }) => Number(id) >= 26 && Number(id) <= 51)) {
    const nested = parseTlv(template.value, `merchant account ${template.id}`);
    if (!nested.some(({ id }) => id === "00")) throw new QrValidationError(`merchant account ${template.id}`, "missing globally unique identifier");
  }
  if (byId.has("62")) parseTlv(byId.get("62").value, "additional data");
  return { valid: true, fields };
}

export function validateNepalQr(payload, configuration = {}) {
  const emvco = validateEmvcoQr(payload);
  return { ...emvco, status: "NEPALQR_NETWORK_VALIDATION_PENDING", reason: "Official NCHL/acquirer technical specification and enrolled merchant configuration are required." };
}
