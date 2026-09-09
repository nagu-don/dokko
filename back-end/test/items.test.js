/**
 * Item-list access control tests — run with:
 *   node --env-file-if-exists=.env test/items.test.js
 *
 * Verifies SEC-005: GET /api/items/list is admin-only, while
 *   GET /api/items/list-approved stays public and returns approved
 *   items only.
 *  1. Unauthenticated GET /api/items/list → 401
 *  2. Non-admin token on GET /api/items/list → 401
 *  3. Authenticated admin GET /api/items/list → full list incl. unapproved
 *  4. GET /api/items/list-approved stays public (no token → 200) and
 *     returns approved items only
 */

import "dotenv/config";
import dns from "node:dns";
import mongoose from "mongoose";
import express from "express";
import jwt from "jsonwebtoken";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

import adminModel from "../models/adminModel.js";
import itemModel from "../models/itemModel.js";
import itemRouter from "../routes/itemRouter.js";

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("MONGO_URI not set — cannot run items tests");
  process.exit(1);
}

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

// ── Express test app ──────────────────────────────────────────
const app = express();
app.use(express.json());
app.use("/api/items", itemRouter);

let server;
let baseURL;
const testPrefix = `_test_items_${Date.now()}`;

const api = async (method, path, body, token) => {
  const url = `${baseURL}${path}`;
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
};

import { connectTestDB, disconnectTestDB } from "./helpers/testDb.js";

await connectTestDB();
server = app.listen(0);
baseURL = `http://127.0.0.1:${server.address().port}`;
const db = mongoose.connection.db;

// Clean previous test data with our prefix
await db.collection("admins").deleteMany({ email: { $regex: `^${testPrefix}` } });
await db.collection("items").deleteMany({ nameEng: { $regex: `^${testPrefix}` } });

const bcrypt = (await import("bcrypt")).default;
const salt = await bcrypt.genSalt(10);
const hashedPassword = await bcrypt.hash("test123456", salt);

const testAdmin = await adminModel.create({
  name: "Test Admin",
  email: `${testPrefix}-admin@test.com`,
  phone: `98${String(Date.now()).slice(-8)}`,
  password: hashedPassword,
  status: "active",
});
const adminToken = jwt.sign({ id: testAdmin._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

// A non-admin token (no matching admin account) must be rejected
const strangerToken = jwt.sign({ id: new mongoose.Types.ObjectId() }, process.env.JWT_SECRET, { expiresIn: "1d" });
// A token signed with the wrong secret is invalid
const badToken = jwt.sign({ id: testAdmin._id }, "wrong-secret");

const makeItem = async (nameEng, approved) =>
  itemModel.create({
    nameEng: `${testPrefix}-${nameEng}`,
    nameNep: `${testPrefix}-${nameEng}-np`,
    unitEng: "kg",
    unitNep: "केजी",
    minPrice: 10,
    maxPrice: 20,
    avgPrice: 15,
    minPriceNep: "१०",
    maxPriceNep: "२०",
    avgPriceNep: "१५",
    status: approved,
    available: approved,
  });

const approvedItem = await makeItem("Approved", true);
const unapprovedItem = await makeItem("Unapproved", false);

// ──────────────────────────────────────────────────────────────
console.log("\n1. Unauthenticated GET /api/items/list");
const noAuth = await api("GET", "/api/items/list");
assert(noAuth.status === 401, "No token returns 401");
assert(noAuth.data.success === false, "Returns success=false");

// ──────────────────────────────────────────────────────────────
console.log("\n2. Non-admin / bad token on GET /api/items/list");
const stranger = await api("GET", "/api/items/list", undefined, strangerToken);
assert(stranger.status === 401, "Non-admin token returns 401");
const bad = await api("GET", "/api/items/list", undefined, badToken);
assert(bad.status === 401, "Bad-signature token returns 401");

// ──────────────────────────────────────────────────────────────
console.log("\n3. Authenticated admin GET /api/items/list");
const authed = await api("GET", "/api/items/list", undefined, adminToken);
assert(authed.status === 200, "Admin token returns 200");
assert(authed.data.success === true, "Returns success=true");
const ids = (authed.data.data || []).map((i) => i._id);
assert(ids.includes(String(approvedItem._id)), "Approved item present in list");
assert(ids.includes(String(unapprovedItem._id)), "Unapproved item present in list");

// ──────────────────────────────────────────────────────────────
console.log("\n4. GET /api/items/list-approved stays public");
const pub = await api("GET", "/api/items/list-approved");
assert(pub.status === 200, "Public (no token) returns 200");
const pubIds = (pub.data.data || []).map((i) => i._id);
assert(pubIds.includes(String(approvedItem._id)), "Approved item present in list-approved");
assert(!pubIds.includes(String(unapprovedItem._id)), "Unapproved item NOT in list-approved");

// ──────────────────────────────────────────────────────────────
// Cleanup
// ──────────────────────────────────────────────────────────────
console.log("\nCleaning up test data...");
await db.collection("admins").deleteMany({ _id: testAdmin._id });
await db.collection("items").deleteMany({ nameEng: { $regex: `^${testPrefix}` } });
console.log("Cleanup done");

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"=".repeat(50)}`);

server.close();
await disconnectTestDB();
process.exit(failed > 0 ? 1 : 0);