/**
 * Issue-reporting pipeline tests — run with:
 *   node --env-file-if-exists=.env test/issueReports.test.js
 *
 * Verifies the backend issue & error reporting pipeline:
 *  1. Anonymous report creation succeeds (201) with a minimal response body
 *  2. A valid Authorization header attributes the report to the user
 *  3. Validation: missing message / invalid source / invalid type / length → 400
 *  4. Listing requires an admin token (401 otherwise) and returns the
 *     paginated shape with populated user/vendor fields
 *  5. Filtering by status / severity
 *  6. Updating a report's status to 'resolved' records resolvedByAdminId
 *     and resolvedAt
 *  7. The summary aggregate reports byStatus / bySeverity counts
 */

import "dotenv/config";
import dns from "node:dns";
import mongoose from "mongoose";
import express from "express";
import jwt from "jsonwebtoken";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

import adminModel from "../models/adminModel.js";
import userModel from "../models/userModel.js";
import issueReportModel from "../models/issueReportModel.js";
import issueRouter from "../routes/issueRouter.js";

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
app.use("/api/issues", issueRouter);

let server;
let baseURL;
const testPrefix = `_test_issues_${Date.now()}`;

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
await db.collection("issuereports").deleteMany({ message: { $regex: `^${testPrefix}` } });
await db.collection("admins").deleteMany({ email: { $regex: `^${testPrefix}` } });
await db.collection("users").deleteMany({ email: { $regex: `^${testPrefix}` } });

const bcrypt = (await import("bcrypt")).default;
const salt = await bcrypt.genSalt(10);
const hashedPassword = await bcrypt.hash("test123456", salt);

const testAdmin = await adminModel.create({
  name: "Issue Test Admin",
  email: `${testPrefix}-admin@test.com`,
  phone: `98${String(Date.now()).slice(-8)}`,
  password: hashedPassword,
  status: "active",
});
const adminToken = jwt.sign({ id: testAdmin._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

const testUser = await userModel.create({
  name: "Issue Test User",
  email: `${testPrefix}-user@test.com`,
  phone: `98${String(Date.now() + 1).slice(-8)}`,
  password: hashedPassword,
});
const userToken = jwt.sign({ id: testUser._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

const strangerToken = jwt.sign({ id: new mongoose.Types.ObjectId() }, process.env.JWT_SECRET, { expiresIn: "1d" });

const reportBody = (id, overrides = {}) => ({
  source: "mobile_customer",
  type: "crash",
  message: `${testPrefix}-msg-${id}: app crashed`,
  ...overrides,
});

// ──────────────────────────────────────────────────────────────
console.log("\n1. Anonymous report creation");
const anon = await api("POST", "/api/issues", reportBody("r1", { severity: "high" }));
assert(anon.status === 201, "Anonymous report returns 201");
assert(anon.data.success === true, "Returns success=true");
assert(anon.data.message === "Report received", "Returns the fixed confirmation message");
assert(anon.data.data && anon.data.data.id, "Response includes the new report id");
assert(
  JSON.stringify(anon.data.data) === JSON.stringify({ id: anon.data.data.id }),
  "Response body stays minimal (only the id, no internal detail)"
);
assert(anon.data.data.id, "Response leaks no message/stack content");

// ──────────────────────────────────────────────────────────────
console.log("\n2. Report with a valid Authorization header is attributed");
const attributed = await api("POST", "/api/issues", reportBody("r2", { type: "user_report", severity: "low" }), userToken);
assert(attributed.status === 201, "Attributed report returns 201");
const storedAttributed = await issueReportModel.findById(attributed.data.data.id);
assert(String(storedAttributed.userId) === String(testUser._id), "userId is populated from the decoded token");
assert(storedAttributed.vendorId === null || storedAttributed.vendorId === undefined, "vendorId stays unset for a user token");

// ──────────────────────────────────────────────────────────────
console.log("\n3. Validation failures");
const noMessage = await api("POST", "/api/issues", { source: "backend", type: "system_error" });
assert(noMessage.status === 400, "Missing message returns 400");
assert(noMessage.data.success === false, "Missing message returns success=false");

const badSource = await api("POST", "/api/issues", reportBody("x", { source: "not-a-source" }));
assert(badSource.status === 400, "Invalid source returns 400");

const badType = await api("POST", "/api/issues", reportBody("x", { type: "not-a-type" }));
assert(badType.status === 400, "Invalid type returns 400");

const tooLong = await api("POST", "/api/issues", reportBody("x", { message: "x".repeat(2001) }));
assert(tooLong.status === 400, "Message over 2000 chars returns 400");

const badToken = await api("POST", "/api/issues", reportBody("r-badtoken", { type: "user_report" }), "garbage-token");
assert(badToken.status === 201, "Garbage Authorization header does NOT fail the report (best-effort)");
assert(badToken.data.success === true, "Bad token still stores the report");

// ──────────────────────────────────────────────────────────────
console.log("\n4. Listing requires an admin token");
const noAuth = await api("GET", "/api/issues");
assert(noAuth.status === 401, "No token returns 401");
const stranger = await api("GET", "/api/issues", undefined, strangerToken);
assert(stranger.status === 401, "Non-admin token returns 401");

// ──────────────────────────────────────────────────────────────
console.log("\n5. Admin listing returns the paginated shape");
const list = await api("GET", "/api/issues", undefined, adminToken);
assert(list.status === 200, "Admin token returns 200");
assert(list.data.success === true, "Returns success=true");
assert(Array.isArray(list.data.data), "data is an array");
assert(list.data.data.length >= 3, "list contains the created reports");
assert(list.data.pagination && list.data.pagination.total >= 3, "pagination.total reflects the filtered count");
assert(
  list.data.pagination.page === 1 &&
    list.data.pagination.limit === 20 &&
    typeof list.data.pagination.pages === "number",
  "pagination exposes page/limit/pages"
);
const dates = list.data.data.map((r) => new Date(r.createdAt).getTime());
assert(dates.every((d, i) => i === 0 || dates[i - 1] >= d), "reports are sorted by createdAt descending");
const attributedRow = list.data.data.find((r) => String(r._id) === String(attributed.data.data.id));
assert(attributedRow && attributedRow.userId && attributedRow.userId.name === testUser.name, "userId is populated with name over the list endpoint");
assert(attributedRow && attributedRow.userId.email === testUser.email, "userId is populated with email");

// ──────────────────────────────────────────────────────────────
console.log("\n6. Status / severity filters");
const highOnly = await api("GET", "/api/issues?severity=high", undefined, adminToken);
assert(highOnly.data.data.every((r) => r.severity === "high"), "severity=high returns only high reports");
const openOnly = await api("GET", "/api/issues?status=open", undefined, adminToken);
assert(openOnly.data.data.every((r) => r.status === "open"), "status=open returns only open reports");

// ──────────────────────────────────────────────────────────────
console.log("\n7. Updating a report's status to resolved");
const resolved = await api("PATCH", `/api/issues/${attributed.data.data.id}/status`, { status: "resolved", adminNote: "Fixed in next release" }, adminToken);
assert(resolved.status === 200, "Resolve returns 200");
assert(resolved.data.success === true, "Returns success=true");
assert(resolved.data.data.status === "resolved", "status becomes resolved");
assert(
  resolved.data.data.resolvedByAdminId === String(testAdmin._id),
  "resolvedByAdminId is set to the acting admin"
);
assert(resolved.data.data.resolvedAt, "resolvedAt is set");

const badStatus = await api("PATCH", `/api/issues/${attributed.data.data.id}/status`, { status: "not-a-status" }, adminToken);
assert(badStatus.status === 400, "Invalid status returns 400");

const missing = await api("PATCH", `/api/issues/${new mongoose.Types.ObjectId()}/status`, { status: "open" }, adminToken);
assert(missing.status === 404, "Unknown report id returns 404");

// ──────────────────────────────────────────────────────────────
console.log("\n8. Summary aggregate");
const summary = await api("GET", "/api/issues/summary", undefined, adminToken);
assert(summary.status === 200, "Summary returns 200");
assert(summary.data.success === true, "Returns success=true");
assert(summary.data.data.byStatus && typeof summary.data.data.byStatus.open === "number", "byStatus includes open count");
assert(summary.data.data.byStatus.resolved === 1, "byStatus.resolved counts the resolved report");
assert(summary.data.data.byStatus.ignored === 0, "byStatus.ignored counts zero");
assert(summary.data.data.bySeverity.high === 1, "bySeverity.high counts the high-severity report");
assert(summary.data.data.bySeverity.low === 1, "bySeverity.low counts the low-severity report");
assert(summary.data.data.totalOpen === summary.data.data.byStatus.open, "totalOpen matches the open count");

// ──────────────────────────────────────────────────────────────
// Cleanup
// ──────────────────────────────────────────────────────────────
console.log("\nCleaning up test data...");
await db.collection("issuereports").deleteMany({ message: { $regex: `^${testPrefix}` } });
await db.collection("admins").deleteMany({ _id: testAdmin._id });
await db.collection("users").deleteMany({ _id: testUser._id });
console.log("Cleanup done");

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"=".repeat(50)}`);

server.close();
await disconnectTestDB();
process.exit(failed > 0 ? 1 : 0);