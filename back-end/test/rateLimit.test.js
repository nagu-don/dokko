/**
 * Rate-limit regression tests — run with:
 *   node --env-file-if-exists=.env test/rateLimit.test.js
 *
 * Verifies SEC-002 (brute-force protection):
 *  1. N+1 rapid login attempts against the same identifier trigger a 429 on
 *     the (N+1)th attempt (N = configured threshold / default 10).
 *  2. Legitimate login still succeeds under the threshold.
 *  3. The three login routes (user / vendor / admin) have independent
 *     limiters — hitting one does not lock out another.
 *  4. Public registration endpoints are rate-limited without blocking a
 *     single legitimate signup.
 *
 * The rate limiters are in-memory, so counters are reset per test process
 * (runAll.js executes each suite in its own child process). Distinct
 * identifiers are used per scenario because the login key is IP+identifier.
 */

import express from "express";
import mongoose from "mongoose";
import { connectTestDB, disconnectTestDB } from "./helpers/testDb.js";
import userModel from "../models/userModel.js";
import userRouter from "../routes/userRouter.js";
import vendorRouter from "../routes/vendorRouter.js";
import adminRouter from "../routes/adminRouter.js";

// These must stay in sync with middleware/rateLimiter.js defaults (or the
// env-tunable values if set).
const LOGIN_LIMIT = Number(process.env.LOGIN_RATE_LIMIT_MAX) || 10;
const ADMIN_LOGIN_LIMIT = Number(process.env.ADMIN_LOGIN_RATE_LIMIT_MAX) || 5;
const REGISTER_LIMIT = Number(process.env.REGISTER_RATE_LIMIT_MAX) || 20;

const app = express();
app.use(express.json());
app.use("/api/users", userRouter);
app.use("/api/vendors", vendorRouter);
app.use("/api/admins", adminRouter);

let server;
let baseURL;
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

const testPrefix = `rate_test_${Date.now()}`;
const db = mongoose.connection.db;
await db.collection("users").deleteMany({ email: { $regex: `^${testPrefix}` } });

// ──────────────────────────────────────────────────────────────
// 1. N+1 rapid user-login attempts -> 429 on the (N+1)th
// ──────────────────────────────────────────────────────────────
console.log(`\n1. User login: ${LOGIN_LIMIT} wrong attempts allowed, ${LOGIN_LIMIT + 1}th -> 429`);
const victimEmail = `${testPrefix}-victim@test.com`;

await api("/api/users/register", {
  name: "Victim User",
  email: victimEmail,
  phone: "9812345601",
  password: "correct-password",
});

let got429 = false;
for (let i = 1; i <= LOGIN_LIMIT; i++) {
  const res = await api("/api/users/login", {
    identifier: victimEmail,
    password: `wrong-password-${i}`,
  });
  if (res.status === 429) {
    got429 = true;
    break;
  }
  assert(res.status === 200 && res.data.success === false, `Attempt ${i}: returns 200 success:false (not locked out)`);
}
assert(!got429, `All first ${LOGIN_LIMIT} attempts were allowed (not rate-limited)`);

const blocked = await api("/api/users/login", {
  identifier: victimEmail,
  password: "wrong-password-final",
});
assert(blocked.status === 429, `(${LOGIN_LIMIT + 1})th attempt returns 429`);
assert(
  blocked.data.success === false && typeof blocked.data.message === "string" && blocked.data.message.length > 0,
  "429 body is the generic non-revealing message"
);
assert(
  !/exists|found|valid|registered/i.test(blocked.data.message),
  "429 message leaks no account-existence information"
);

// ──────────────────────────────────────────────────────────────
// 2. Legitimate login still succeeds under the threshold
// ──────────────────────────────────────────────────────────────
console.log("\n2. Legitimate login succeeds under the threshold");
const legitEmail = `${testPrefix}-legit@test.com`;
const regRes = await api("/api/users/register", {
  name: "Legit User",
  email: legitEmail,
  phone: "9812345602",
  password: "correct-password",
});
assert(regRes.status === 201 && regRes.data.success === true, "Legitimate registration succeeds (201, success)");
assert(regRes.data.token, "Registration returns a session token");

const loginRes = await api("/api/users/login", {
  identifier: legitEmail,
  password: "correct-password",
});
assert(loginRes.status === 200 && loginRes.data.success === true, "Correct-password login succeeds (not 429)");
assert(typeof loginRes.data.token === "string" && loginRes.data.token.length > 0, "Login returns a session token");

// ──────────────────────────────────────────────────────────────
// 3. Independent limiters across the three login routes
// ──────────────────────────────────────────────────────────────
console.log("\n3. Login limiters are per-route and per-identifier");

// (a) Different identifier on the same route is NOT blocked after a lockout
const otherEmail = `${testPrefix}-other@test.com`;
const otherRes = await api("/api/users/login", {
  identifier: otherEmail,
  password: "wrong-password",
});
assert(otherRes.status === 200 && otherRes.data.success === false, "Different identifier on user login is not blocked (IP+identifier key)");

// (b) Vendor login is independent of user login — same identifier still works
const vendorRes = await api("/api/vendors/login", {
  identifier: victimEmail,
  password: "wrong-password",
});
assert(vendorRes.status === 200 && vendorRes.data.success === false, "Vendor login not blocked after user-login lockout");

// (c) Admin login is independent — same identifier still works
const adminProbe1 = await api("/api/admins/login", {
  identifier: victimEmail,
  password: "wrong-password",
});
assert(adminProbe1.status === 200 && adminProbe1.data.success === false, "Admin login not blocked after user-login lockout");

// (d) Admin login has a stricter threshold: N+1 -> 429
console.log(`   Admin login: ${ADMIN_LOGIN_LIMIT} allowed, ${ADMIN_LOGIN_LIMIT + 1}th -> 429`);
const adminEmail = `${testPrefix}-admin@test.com`;
let admin429 = false;
for (let i = 1; i <= ADMIN_LOGIN_LIMIT; i++) {
  const res = await api("/api/admins/login", {
    identifier: adminEmail,
    password: `wrong-password-${i}`,
  });
  if (res.status === 429) {
    admin429 = true;
    break;
  }
  assert(res.status === 200 && res.data.success === false, `Admin attempt ${i}: returns 200 success:false`);
}
assert(!admin429, `All first ${ADMIN_LOGIN_LIMIT} admin attempts allowed`);
const adminBlocked = await api("/api/admins/login", {
  identifier: adminEmail,
  password: "wrong-password-final",
});
assert(adminBlocked.status === 429, `Admin (${ADMIN_LOGIN_LIMIT + 1})th attempt returns 429`);
assert(adminBlocked.data.success === false, "Admin 429 body is the generic non-revealing message");

// ──────────────────────────────────────────────────────────────
// 4. Registration is rate-limited but allows a single legitimate signup
// ──────────────────────────────────────────────────────────────
// Registrations from scenarios 1 and 2 already consumed 2 slots on this IP's
// shared register limiter, so track the running count deterministically.
let regConsumed = 2;
console.log(`\n4. Registration limiter: ${REGISTER_LIMIT} allowed per window, then 429`);
const regLimitEmail = `${testPrefix}-reglimit@test.com`;
const singleSignup = await api("/api/users/register", {
  name: "Reg Limit",
  email: regLimitEmail,
  phone: "9812345603",
  password: "correct-password",
});
regConsumed++;
assert(singleSignup.status === 201 && singleSignup.data.success === true, "Single legitimate signup is not blocked");

// empty-body requests still pass through the limiter but fail validation (400)
const remainingAllowed = REGISTER_LIMIT - regConsumed;
let early429 = false;
for (let i = 1; i <= remainingAllowed; i++) {
  const res = await api("/api/users/register", {});
  if (res.status === 429) {
    early429 = true;
    break;
  }
  assert(res.status === 400 && res.data.success === false, `Register attempt ${i}: validation rejects (not 429)`);
}
assert(!early429, `All ${REGISTER_LIMIT} register attempts allowed (no early 429)`);

const regBlocked = await api("/api/users/register", {});
assert(regBlocked.status === 429, `(${REGISTER_LIMIT + 1})th register attempt returns 429`);
assert(regBlocked.data.success === false, "Register 429 body is the generic non-revealing message");

// admin register (public endpoint) shares the same public-registration limiter
console.log(`   Admin register shares the public registration limiter (${REGISTER_LIMIT}/window)`);
await db.collection("admins").deleteMany({ email: { $regex: `^${testPrefix}` } });
const adminRegBlocked = await api("/api/admins/register", {});
assert(adminRegBlocked.status === 429, "Admin register is rate-limited (returns 429 after flooding user register from same IP)");

console.log(`\n${passed} passed, ${failed} failed`);
await db.collection("users").deleteMany({ email: { $regex: `^${testPrefix}` } });
await db.collection("admins").deleteMany({ email: { $regex: `^${testPrefix}` } });
await disconnectTestDB();
server.close();

process.exit(failed === 0 ? 0 : 1);