/**
 * Field encryption tests — run with: node --env-file-if-exists=.env test/fieldEncryption.test.js
 *
 * Tests:
 *  1. Round-trip: encrypt then decrypt restores the original
 *  2. Uniqueness: random IV means the same plaintext encrypts differently
 *  3. Ciphertext format: iv:authTag:payload triple
 *  4. decryptField returns plaintext as-is for legacy/unencrypted values
 *  5. decryptField / encryptField handle null/empty passthrough
 *  6. maskAccountNumber masks all but the last 4 digits
 *  7. maskAccountNumber returns null for null/empty input
 */

import "dotenv/config";
import { encryptField, decryptField, maskAccountNumber } from "../utils/fieldEncryption.js";

let passed = 0;
let failed = 0;

const assert = (condition, label) => {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
};

if (!process.env.FIELD_ENCRYPTION_KEY) {
  console.error("FIELD_ENCRYPTION_KEY not set — cannot run field encryption tests");
  process.exit(1);
}

const ACCOUNT = "1234567890123456";

console.log("\n1. Round-trip encryption");
const encrypted = encryptField(ACCOUNT);
assert(typeof encrypted === "string", "Encryption produces a string");
assert(encrypted !== ACCOUNT, "Ciphertext differs from plaintext");
assert(decryptField(encrypted) === ACCOUNT, "Decrypt restores the original plaintext");

console.log("\n2. Uniqueness (random IV)");
const encrypted2 = encryptField(ACCOUNT);
assert(encrypted !== encrypted2, "Same plaintext encrypts to different ciphertext each time");

console.log("\n3. Ciphertext format");
const parts = encrypted.split(":");
assert(parts.length === 3, "Ciphertext is a 3-part iv:authTag:payload value");
assert(parts.every((p) => p.length > 0), "No empty segments in ciphertext");

console.log("\n4. Legacy/unencrypted passthrough");
assert(decryptField("9876543210") === "9876543210", "Legacy plaintext passes through unchanged");

console.log("\n5. Null/empty passthrough");
assert(encryptField(null) === null, "encryptField(null) returns null");
assert(encryptField("") === "", "encryptField('') returns empty");
assert(decryptField(null) === null, "decryptField(null) returns null");
assert(decryptField("") === "", "decryptField('') returns empty");

console.log("\n6. Masking");
assert(maskAccountNumber("1234567890123456") === "XXXXXXXX3456", "Masks all but last 4 digits");
assert(maskAccountNumber("12345") === "XXXXXXXX2345", "Short value — masks all but last 4");
assert(maskAccountNumber("1234") === "XXXXXXXX1234", "4-digit value — shows complete number");

console.log("\n7. Masking null/empty");
assert(maskAccountNumber(null) === null, "maskAccountNumber(null) returns null");
assert(maskAccountNumber("") === null, "maskAccountNumber('') returns null");

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"=".repeat(50)}`);

process.exit(failed > 0 ? 1 : 0);