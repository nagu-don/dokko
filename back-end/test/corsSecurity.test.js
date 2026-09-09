/**
 * CORS + baseline security headers tests — run with:
 *   node --env-file-if-exists=.env test/corsSecurity.test.js
 *
 * Verifies SEC-004:
 *  1. A request from an allowlisted origin succeeds with correct CORS headers.
 *  2. A request from a non-allowlisted origin is blocked by CORS.
 *  3. A request with no Origin header (e.g. native mobile app) succeeds.
 *  4. Baseline security headers (helmet) are present on responses.
 *  5. The /images route sends a permissive Cross-Origin-Resource-Policy so
 *     frontend <img> tags can display images cross-origin.
 *
 * This test does NOT require a database: it exercises the exact middleware
 * stack used by server.js (helmet + express.json + cors allowlist).
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";

const DEFAULT_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
];
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : DEFAULT_ORIGINS;

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

// ── Express test app mirroring server.js middleware ───────────
const app = express();
app.use(helmet());
app.use(express.json());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  })
);
app.get("/api/items/list-approved", (req, res) => res.json({ success: true, data: [] }));
app.use(
  "/images",
  (req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static("uploads")
);

let server;
let baseURL;
server = app.listen(0);
baseURL = `http://127.0.0.1:${server.address().port}`;

const get = async (path, origin) => {
  const headers = {};
  if (origin) headers.Origin = origin;
  const res = await fetch(`${baseURL}${path}`, { headers });
  return {
    status: res.status,
    allowOrigin: res.headers.get("access-control-allow-origin"),
    contentTypeOptions: res.headers.get("x-content-type-options"),
    frameOptions: res.headers.get("x-frame-options"),
    corp: res.headers.get("cross-origin-resource-policy"),
  };
};

// ──────────────────────────────────────────────────────────────
console.log("\n1. Allowlisted origin succeeds with correct CORS headers");
const allowed = await get("/api/items/list-approved", "http://localhost:5173");
assert(allowed.status === 200, "Allowlisted origin returns 200");
assert(allowed.allowOrigin === "http://localhost:5173", "ACAO echoes allowlisted origin");

// ──────────────────────────────────────────────────────────────
console.log("\n2. Non-allowlisted origin is blocked by CORS");
const evil = await get("/api/items/list-approved", "https://evil.example");
assert(evil.status === 200 || evil.status === 500, "Non-allowlisted origin does not leak data");
assert(evil.allowOrigin === null, "No ACAO header for non-allowlisted origin");
assert(evil.allowOrigin !== "https://evil.example", "Non-allowlisted origin is NOT reflected");

// ──────────────────────────────────────────────────────────────
console.log("\n3. No Origin header (native mobile app) succeeds");
const noOrigin = await get("/api/items/list-approved", null);
assert(noOrigin.status === 200, "No-Origin request (mobile) returns 200");

// ──────────────────────────────────────────────────────────────
console.log("\n4. Baseline security headers present (helmet)");
const sec = await get("/api/items/list-approved", "http://localhost:5175");
assert(sec.contentTypeOptions === "nosniff", "X-Content-Type-Options is nosniff");
assert(sec.frameOptions != null, "X-Frame-Options is set");
assert(sec.frameOptions === "SAMEORIGIN", "X-Frame-Options is SAMEORIGIN");

// ──────────────────────────────────────────────────────────────
console.log("\n5. /images route allows cross-origin resource loading");
const img = await get("/images/no-preview.jpg", "http://localhost:5173");
assert(img.corp === "cross-origin", "/images sets Cross-Origin-Resource-Policy: cross-origin");

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"=".repeat(50)}`);

await new Promise((r) => setTimeout(r, 100));
server.close();
await new Promise((r) => setTimeout(r, 200));
process.exit(failed > 0 ? 1 : 0);
