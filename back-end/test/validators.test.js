/**
 * Unit tests for back-end/utils/validators.js — run with:
 *   node --env-file-if-exists=.env test/validators.test.js
 */

import assert from "node:assert/strict";
import { isValidEmail, isStrongPassword } from "../utils/validators.js";

let passed = 0;
let failed = 0;

const test = (label, fn) => {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${label}`);
    console.error(`    ${err.message}`);
  }
};

// ── isValidEmail ──────────────────────────────────────────────

console.log("\nisValidEmail");

test("valid email with subdomain", () => {
  assert.equal(isValidEmail("user@sub.domain.com"), true);
});

test("valid simple email", () => {
  assert.equal(isValidEmail("user@example.com"), true);
});

test("email with no @ is rejected", () => {
  assert.equal(isValidEmail("userexample.com"), false);
});

test("email with no domain is rejected", () => {
  assert.equal(isValidEmail("user@"), false);
});

test("email with no TLD is rejected", () => {
  assert.equal(isValidEmail("user@example"), false);
});

test("empty string is rejected", () => {
  assert.equal(isValidEmail(""), false);
});

test("email with spaces is rejected", () => {
  assert.equal(isValidEmail("user @example.com"), false);
});

// ── isStrongPassword ──────────────────────────────────────────

console.log("\nisStrongPassword");

test("only lowercase letters under 8 chars fails", () => {
  assert.equal(isStrongPassword("abcdefg"), false);
});

test("8-character alphanumeric password passes (letters + digits)", () => {
  assert.equal(isStrongPassword("abcd1234"), true);
});

test("8-character letters-only password fails (single class)", () => {
  assert.equal(isStrongPassword("abcdefgh"), false);
});

test("8-character digits-only password fails (single class)", () => {
  assert.equal(isStrongPassword("12345678"), false);
});

test("letters + symbols passes", () => {
  assert.equal(isStrongPassword("abcdef!@"), true);
});

test("digits + symbols passes", () => {
  assert.equal(isStrongPassword("1234!@#$"), true);
});

test("all three classes passes", () => {
  assert.equal(isStrongPassword("abc123!@"), true);
});

test("7-character mixed password fails (too short)", () => {
  assert.equal(isStrongPassword("ab1!@#$"), false);
});

test("empty string fails", () => {
  assert.equal(isStrongPassword(""), false);
});

test("non-string input fails", () => {
  assert.equal(isStrongPassword(undefined), false);
  assert.equal(isStrongPassword(null), false);
  assert.equal(isStrongPassword(12345678), false);
});

// ── Summary ───────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
