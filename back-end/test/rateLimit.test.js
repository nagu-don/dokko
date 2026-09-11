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
import jwt from "jsonwebtoken";
import { connectTestDB, disconnectTestDB } from "./helpers/testDb.js";
import userModel from "../models/userModel.js";
import userRouter from "../routes/userRouter.js";
import vendorRouter from "../routes/vendorRouter.js";
import adminRouter from "../routes/adminRouter.js";
import orderRouter from "../routes/orderRouter.js";

// These must stay in sync with middleware/rateLimiter.js defaults (or the
// env-tunable values if set).
const LOGIN_LIMIT = Number(process.env.LOGIN_RATE_LIMIT_MAX) || 10;
const ADMIN_LOGIN_LIMIT = Number(process.env.ADMIN_LOGIN_RATE_LIMIT_MAX) || 5;
const REGISTER_LIMIT = Number(process.env.REGISTER_RATE_LIMIT_MAX) || 20;
const GOOGLE_AUTH_LIMIT = Number(process.env.GOOGLE_AUTH_RATE_LIMIT_MAX) || 20;
const ORDER_PLACEMENT_LIMIT = Number(process.env.ORDER_PLACEMENT_RATE_LIMIT_MAX) || 30;

const app = express();
app.use(express.json());
app.use("/api/users", userRouter);
app.use("/api/vendors", vendorRouter);
app.use("/api/admins", adminRouter);
app.use("/api/orders", orderRouter);

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

const apiAuth = async (path, token, body) => {
  const res = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
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
  assert(res.status === 401 && res.data.success === false, `Attempt ${i}: returns 401 success:false (not locked out)`);
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
assert(otherRes.status === 401 && otherRes.data.success === false, "Different identifier on user login is not blocked (IP+identifier key)");

// (b) Vendor login is independent of user login — same identifier still works
const vendorRes = await api("/api/vendors/login", {
  identifier: victimEmail,
  password: "wrong-password",
});
assert(vendorRes.status === 401 && vendorRes.data.success === false, "Vendor login not blocked after user-login lockout");

// (c) Admin login is independent — same identifier still works
const adminProbe1 = await api("/api/admins/login", {
  identifier: victimEmail,
  password: "wrong-password",
});
assert(adminProbe1.status === 401 && adminProbe1.data.success === false, "Admin login not blocked after user-login lockout");

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
  assert(res.status === 401 && res.data.success === false, `Admin attempt ${i}: returns 401 success:false`);
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

// ──────────────────────────────────────────────────────────────
// 5. Google OAuth endpoints (no credential needed) are per-IP limited
// ──────────────────────────────────────────────────────────────
console.log(`\n5. Google OAuth: ${GOOGLE_AUTH_LIMIT} attempts allowed per IP, then 429`);
let google429 = false;
for (let i = 1; i <= GOOGLE_AUTH_LIMIT; i++) {
  const res = await api("/api/users/google", {});
  if (res.status === 429) {
    google429 = true;
    break;
  }
  assert(res.status === 400 && res.data.success === false, `Google attempt ${i}: validation rejects (not 429)`);
}
assert(!google429, `All ${GOOGLE_AUTH_LIMIT} google attempts allowed (no early 429)`);

const googleBlocked = await api("/api/users/google", {});
assert(googleBlocked.status === 429, `(${GOOGLE_AUTH_LIMIT + 1})th google attempt returns 429`);
assert(googleBlocked.data.success === false, "Google 429 body is the generic non-revealing message");

const vendorGoogleBlocked = await api("/api/vendors/google", {});
assert(vendorGoogleBlocked.status === 429, "Vendor /google shares the same per-IP limiter (429 from same IP)");

// ──────────────────────────────────────────────────────────────
// 6. Order placement is per-authenticated-user limited
// ──────────────────────────────────────────────────────────────
// The register limiter is already exhausted above, so create the users directly
// in the DB and sign their JWTs ourselves.
console.log(`\n6. Order placement: ${ORDER_PLACEMENT_LIMIT} attempts allowed per user per window, then 429`);
const spamUser = await userModel.create({
  name: "Order Spam",
  email: `${testPrefix}-orderspam@test.com`,
  phone: "9812345604",
  password: "correct-password",
});
const innocentUser = await userModel.create({
  name: "Innocent User",
  email: `${testPrefix}-innocent@test.com`,
  phone: "9812345605",
  password: "correct-password",
});
const spamToken = jwt.sign({ id: spamUser._id }, process.env.JWT_SECRET);
const innocentToken = jwt.sign({ id: innocentUser._id }, process.env.JWT_SECRET);

// Each attempt is a distinct fictional order (fresh item id + label), never a replay.
const orderBody = (i) => ({
  items: [{ itemId: new mongoose.Types.ObjectId().toString(), quantity: 1 }],
  dropoff: { lat: 27.71, lng: 85.32, label: `Rate test ${i}` },
});

let order429 = false;
for (let i = 1; i <= ORDER_PLACEMENT_LIMIT; i++) {
  const res = await apiAuth("/api/orders/place", spamToken, orderBody(i));
  if (res.status === 429) {
    order429 = true;
    break;
  }
  assert(res.status === 400 && res.data.success === false, `Place attempt ${i}: validation rejects (not 429)`);
}
assert(!order429, `All ${ORDER_PLACEMENT_LIMIT} placement attempts allowed (no early 429)`);

const orderBlocked = await apiAuth("/api/orders/place", spamToken, orderBody("blocked"));
assert(orderBlocked.status === 429, `(${ORDER_PLACEMENT_LIMIT + 1})th placement attempt returns 429`);
assert(orderBlocked.data.success === false, "Order-placement 429 body is the generic non-revealing message");

const innocentRes = await apiAuth("/api/orders/place", innocentToken, orderBody("innocent"));
assert(innocentRes.status !== 429, "Different user's placement in the same window is not blocked (per-user key)");
assert(innocentRes.status === 400 && innocentRes.data.success === false, "Different user's placement still hits the controller (unaffected)");

console.log(`\n${passed} passed, ${failed} failed`);
await db.collection("users").deleteMany({ email: { $regex: `^${testPrefix}` } });
await db.collection("admins").deleteMany({ email: { $regex: `^${testPrefix}` } });
await disconnectTestDB();
server.close();

process.exit(failed === 0 ? 0 : 1);