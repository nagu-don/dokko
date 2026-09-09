/**
 * Google auth placeholder-phone regression tests — run with:
 *   node --env-file-if-exists=.env test/googleAuth.test.js
 *
 * Verifies that a first-time "Sign in with Google" succeeds on BOTH the
 * customer and vendor apps now that the placeholder phone is a valid
 * `/^\d{10}$/` value derived from the Google `sub` (flagged via
 * `phoneIsPlaceholder`), instead of the old `g`+9-digits format that always
 * failed the phone validator.
 *
 * Tests:
 *  1. First-time Google sign-in (user) creates an account, returns a valid
 *     token, and stores a 10-digit placeholder flagged as such.
 *  2. Returning Google user (same email/sub) logs in without creating a new
 *     account and keeps the stored placeholder.
 *  3. First-time Google sign-in (vendor) creates a vendor account.
 *  4. Returning Google vendor keeps the existing account.
 *  5. Concurrent first sign-ins (double submit) produce exactly one account
 *     and both get a valid session.
 *  6. Different Google `sub`s produce different placeholder phones; the same
 *     `sub` is deterministic; placeholders pass the phone regex.
 *  7. Legacy documents created without `phoneIsPlaceholder` still validate
 *     (default false) — no migration required.
 *  8. Non-Google email/phone registration is unaffected (flag stays false).
 *  9. PATCH /api/users/phone clears the placeholder flag.
 *
 * Google token verification is exercised end-to-end against a disposable RSA
 * key: global fetch is stubbed to serve a local JWKS for the Google certs URL
 * so no outbound Google call is made.
 */

import "dotenv/config";
import dns from "node:dns";
import crypto from "node:crypto";
import mongoose from "mongoose";
import express from "express";
import jwt from "jsonwebtoken";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

import userModel from "../models/userModel.js";
import vendorModel from "../models/vendorModel.js";
import userRouter from "../routes/userRouter.js";
import vendorRouter from "../routes/vendorRouter.js";
import { makePlaceholderPhone, makeGooglePassword } from "../controllers/googleAuthFactory.js";
import { connectTestDB, disconnectTestDB } from "./helpers/testDb.js";

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("MONGO_URI not set — cannot run google auth tests");
  process.exit(1);
}
if (!process.env.GOOGLE_CLIENT_ID) {
  console.error("GOOGLE_CLIENT_ID not set — cannot run google auth tests");
  process.exit(1);
}

let passed = 0;
let failed = 0;
const assert = (condition, label) => {
  if (condition) {
    console.log(`  \u2713 ${label}`);
    passed++;
  } else {
    console.error(`  \u2717 ${label}`);
    failed++;
  }
};

// ── disposable signing key + fake Google JWKS ──────────────────
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const KID = "test-google-key";
const publicJwk = publicKey.export({ format: "jwk" });
publicJwk.kid = KID;
publicJwk.alg = "RS256";
publicJwk.use = "sig";
const fakeJwks = { keys: [publicJwk] };

const originalFetch = globalThis.fetch;

// sign a fake Google ID token for the given payload
const makeGoogleToken = (payload) =>
  jwt.sign(payload, privateKey, {
    algorithm: "RS256",
    expiresIn: "1h",
    header: { kid: KID },
  });

const googlePayload = (sub, email, name) => ({
  iss: "https://accounts.google.com",
  aud: process.env.GOOGLE_CLIENT_ID,
  sub,
  email,
  email_verified: true,
  name,
});

// ── Express test app ──────────────────────────────────────────
const app = express();
app.use(express.json());
app.use("/api/users", userRouter);
app.use("/api/vendors", vendorRouter);

let server;
let baseURL;
const testPrefix = `_test_goog_${Date.now()}`;

const api = async (path, body) => {
  const res = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
};

await connectTestDB();
server = app.listen(0);
baseURL = `http://127.0.0.1:${server.address().port}`;
const db = mongoose.connection.db;

await db.collection("users").deleteMany({ email: { $regex: `^${testPrefix}` } });
await db.collection("vendors").deleteMany({ email: { $regex: `^${testPrefix}` } });

// ──────────────────────────────────────────────────────────────
// 1. First-time Google sign-in (user)
// ──────────────────────────────────────────────────────────────
console.log("\n1. First-time Google sign-in (user)");
const userSub = `gsub-${Date.now()}-1`;
const userEmail = `${testPrefix}-user@test.com`;
const beforeCount = await userModel.countDocuments({ email: userEmail });

globalThis.fetch = async (url, options) => {
  if (String(url).includes("googleapis.com/oauth2/v3/certs")) {
    return new Response(JSON.stringify(fakeJwks), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return originalFetch(url, options);
};

const userRes = await api("/api/users/google", {
  credential: makeGoogleToken(googlePayload(userSub, userEmail, "Google User One")),
});
assert(userRes.status === 200, "First-time user Google sign-in returns 200");
assert(userRes.data.success === true, "Returns success=true");
assert(typeof userRes.data.token === "string" && userRes.data.token.length > 0, "Returns a session token");

let decoded = null;
try {
  decoded = jwt.verify(userRes.data.token, process.env.JWT_SECRET);
} catch {
  decoded = null;
}
assert(decoded && String(decoded.id).length > 0, "Session token is valid and signed with JWT_SECRET");

const afterCount = await userModel.countDocuments({ email: userEmail });
assert(afterCount === beforeCount + 1, "Exactly one user account was created");

const createdUser = await userModel.findOne({ email: userEmail });
assert(createdUser !== null, "User account exists in DB");
assert(/^\d{10}$/.test(createdUser.phone), "Stored placeholder phone matches /^\\d{10}$/");
assert(createdUser.phoneIsPlaceholder === true, "Account flagged as phoneIsPlaceholder=true");
assert(createdUser.phone === makePlaceholderPhone(userSub), "Placeholder is deterministic from the Google sub");
assert(
  typeof createdUser.password === "string" && createdUser.password.length > 0,
  "Google account stores a non-empty placeholder password (schema required)"
);
assert(createdUser.password === makeGooglePassword(userSub), "Placeholder password is derived from the Google sub");

// ──────────────────────────────────────────────────────────────
// 2. Returning Google user
// ──────────────────────────────────────────────────────────────
console.log("\n2. Returning Google user (same sub/email)");
const returnRes = await api("/api/users/google", {
  credential: makeGoogleToken(googlePayload(userSub, userEmail, "Google User One")),
});
assert(returnRes.status === 200 && returnRes.data.success === true, "Returning user logs in (200, success)");
assert(typeof returnRes.data.token === "string" && returnRes.data.token.length > 0, "Returning user gets a session token");
assert((await userModel.countDocuments({ email: userEmail })) === 1, "No duplicate account created on return");
const reloadedUser = await userModel.findOne({ email: userEmail });
assert(reloadedUser.phone === createdUser.phone, "Placeholder phone unchanged for returning user");

// ──────────────────────────────────────────────────────────────
// 3. First-time Google sign-in (vendor)
// ──────────────────────────────────────────────────────────────
console.log("\n3. First-time Google sign-in (vendor)");
const vendorSub = `gsub-${Date.now()}-vendor`;
const vendorEmail = `${testPrefix}-vendor@test.com`;
const vendorBefore = await vendorModel.countDocuments({ email: vendorEmail });

const vendorRes = await api("/api/vendors/google", {
  credential: makeGoogleToken(googlePayload(vendorSub, vendorEmail, "Google Vendor One")),
});
assert(vendorRes.status === 200, "First-time vendor Google sign-in returns 200");
assert(vendorRes.data.success === true, "Returns success=true");
assert(typeof vendorRes.data.token === "string" && vendorRes.data.token.length > 0, "Returns a session token");
assert((await vendorModel.countDocuments({ email: vendorEmail })) === vendorBefore + 1, "Exactly one vendor account created");

const createdVendor = await vendorModel.findOne({ email: vendorEmail });
assert(createdVendor !== null, "Vendor account exists in DB");
assert(/^\d{10}$/.test(createdVendor.phone), "Vendor placeholder phone matches /^\\d{10}$/");
assert(createdVendor.phoneIsPlaceholder === true, "Vendor account flagged as phoneIsPlaceholder=true");

// returning vendor
const vendorReturn = await api("/api/vendors/google", {
  credential: makeGoogleToken(googlePayload(vendorSub, vendorEmail, "Google Vendor One")),
});
assert(vendorReturn.status === 200 && vendorReturn.data.success === true, "Returning vendor logs in (200, success)");
assert(
  (await vendorModel.countDocuments({ email: vendorEmail })) === vendorBefore + 1,
  "No duplicate vendor account created on return"
);

// ──────────────────────────────────────────────────────────────
// 4. Concurrent first sign-in (double submit)
// ──────────────────────────────────────────────────────────────
console.log("\n4. Concurrent first sign-in (double submit)");
const raceEmail = `${testPrefix}-race@test.com`;
const raceSub = `gsub-${Date.now()}-race`;
const token = makeGoogleToken(googlePayload(raceSub, raceEmail, "Race User"));
const raceResults = await Promise.all([
  api("/api/users/google", { credential: token }),
  api("/api/users/google", { credential: token }),
]);
const raceStatuses = raceResults.map((r) => r.status);
const raceOk = raceStatuses.filter((s) => s === 200).length;
assert(raceOk === 2, `Both concurrent requests succeed (got ${raceOk}/2 200s)`);
assert(
  raceResults.every((r) => r.data.success === true && typeof r.data.token === "string"),
  "Both concurrent responses carry a valid session"
);
assert((await userModel.countDocuments({ email: raceEmail })) === 1, "Concurrent double-submit creates exactly one account");

// ──────────────────────────────────────────────────────────────
// 5. Placeholder determinism, uniqueness and format
// ──────────────────────────────────────────────────────────────
console.log("\n5. Placeholder format, determinism and uniqueness");
const subA = `gsub-${Date.now()}-A`;
const subB = `gsub-${Date.now()}-B`;
const phoneA = makePlaceholderPhone(subA);
const phoneB = makePlaceholderPhone(subB);
assert(/^\d{10}$/.test(phoneA) && phoneA.length === 10, "Placeholder A is exactly 10 digits");
assert(/^\d{10}$/.test(phoneB) && phoneB.length === 10, "Placeholder B is exactly 10 digits");
assert(phoneA === makePlaceholderPhone(subA), "Placeholder is deterministic for the same sub");
assert(phoneA !== makePlaceholderPhone(subA, 1), "Changing the collision salt changes the placeholder");
assert(phoneA !== phoneB, "Different Google subs produce different placeholder phones");

// a salt retry still yields a validator-compatible value
const retried = makePlaceholderPhone(subA, 5);
const retriedDoc = new userModel({
  name: "Retry Probe",
  email: `${testPrefix}-retry@test.com`,
  phone: retried,
  password: "hashed",
});
assert(!retriedDoc.validateSync(), `Salted placeholder passes user model validation (${retried})`);

// ──────────────────────────────────────────────────────────────
// 6. Legacy documents (no phoneIsPlaceholder field) still validate
// ──────────────────────────────────────────────────────────────
console.log("\n6. Backward compatibility for existing documents");
const legacyEmail = `${testPrefix}-legacy@test.com`;
await db.collection("users").insertOne({
  name: "Legacy User",
  email: legacyEmail,
  phone: "9800000000",
  password: "hashed",
});
const legacyDoc = await userModel.findOne({ email: legacyEmail });
assert(legacyDoc !== null, "Legacy user loads through the model");
assert(legacyDoc.phoneIsPlaceholder === false, "Legacy doc without the field defaults phoneIsPlaceholder=false");
assert(!legacyDoc.validateSync(), "Legacy doc (created without the field) still validates");

const legacyVendorEmail = `${testPrefix}-legacy-vendor@test.com`;
await db.collection("vendors").insertOne({
  name: "Legacy Vendor",
  email: legacyVendorEmail,
  phone: "9811111111",
  password: "hashed",
});
const legacyVendorDoc = await vendorModel.findOne({ email: legacyVendorEmail });
assert(legacyVendorDoc !== null, "Legacy vendor loads through the model");
assert(legacyVendorDoc.phoneIsPlaceholder === false, "Legacy vendor defaults phoneIsPlaceholder=false");

// ──────────────────────────────────────────────────────────────
// 7. Non-Google registration unaffected
// ──────────────────────────────────────────────────────────────
console.log("\n7. Non-Google registration unaffected");
const regEmail = `${testPrefix}-reg@test.com`;
const regPhone = `97${String(Date.now()).slice(-8)}`;
const regRes = await api("/api/users/register", {
  name: "Regular User",
  email: regEmail,
  phone: regPhone,
  password: "test123456",
});
assert(regRes.status === 201 && regRes.data.success === true, "Regular email/phone registration still works");
const regUser = await userModel.findOne({ email: regEmail });
assert(regUser !== null && regUser.phone === regPhone, "Regular registration stores the real phone");
assert(regUser.phoneIsPlaceholder === false, "Regular registration leaves phoneIsPlaceholder=false");

// ──────────────────────────────────────────────────────────────
// 8. PATCH /api/users/phone clears the placeholder flag
// ──────────────────────────────────────────────────────────────
console.log("\n8. Saving a real phone clears the placeholder flag");
const userToken = userRes.data.token;
const realPhone = `98${String(Date.now() + 1).slice(-8)}`;
const patchRes = await fetch(`${baseURL}/api/users/phone`, {
  method: "PATCH",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${userToken}`,
  },
  body: JSON.stringify({ phone: realPhone }),
});
const patchData = await patchRes.json();
assert(patchRes.status === 200 && patchData.success === true, "Phone update succeeds (200)");
assert(patchData.data.phone === realPhone, "Phone updated to the real number");
assert(patchData.data.phoneIsPlaceholder === false, "phoneIsPlaceholder cleared to false after saving a real phone");
const dbAfterPatch = await userModel.findOne({ email: userEmail });
assert(dbAfterPatch.phone === realPhone, "DB reflects the real phone");
assert(dbAfterPatch.phoneIsPlaceholder === false, "DB flag cleared after saving a real phone");

// ──────────────────────────────────────────────────────────────
// Cleanup
// ──────────────────────────────────────────────────────────────
console.log("\nCleaning up test data...");
globalThis.fetch = originalFetch;
await db.collection("users").deleteMany({ email: { $regex: `^${testPrefix}` } });
await db.collection("vendors").deleteMany({ email: { $regex: `^${testPrefix}` } });
console.log("Cleanup done");

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"=".repeat(50)}`);

server.close();
await disconnectTestDB();
process.exit(failed > 0 ? 1 : 0);