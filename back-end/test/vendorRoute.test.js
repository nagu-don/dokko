/**
 * Vendor route-proxy tests — run with:
 *   node --env-file-if-exists=.env test/vendorRoute.test.js
 *
 * Tests the routing proxy the vendor navigation map uses:
 *   POST /api/vendors/route   (authVendor)
 *
 * The proxy is a pure server-side relay: the mobile app sends its GPS + the
 * drop-off and the backend asks its OSRM instances — the client never calls
 * those hosts directly. The OSRM call is stubbed here so the suite never
 * depends on the public instances / the network.
 *
 * Covers:
 *  1. Unauthenticated / invalid token → 401
 *  2. Invalid / missing coordinates → 400
 *  3. Valid request returns the exact shape the mobile client consumes
 *     (distance, duration, geometry.coordinates of [lng, lat] pairs)
 *  4. The backend queries its first OSRM instance, then falls through to the
 *     second one when the first fails
 *  5. The request URL encodes lng,lat pairs ordered origin → drop-off with the
 *     same params the old client sent (overview, geometries, alternatives)
 *  6. The shortest route alternative is selected (path of least distance)
 *  7. All instances failing → 502
 */

import "dotenv/config";
import dns from "node:dns";
import axios from "axios";
import mongoose from "mongoose";
import express from "express";
import jwt from "jsonwebtoken";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

import vendorModel from "../models/vendorModel.js";
import vendorRouter from "../routes/vendorRouter.js";
import { connectTestDB, disconnectTestDB } from "./helpers/testDb.js";

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

const app = express();
app.use(express.json());
app.use("/api/vendors", vendorRouter);

let server;
let baseURL;
const testPrefix = `_test_route_${Date.now()}`;

const api = async (method, path, body, token) => {
  const url = `${baseURL}${path}`;
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const useBody = !["GET", "HEAD"].includes(method) && body !== undefined;
  const res = await fetch(url, {
    method,
    headers,
    body: useBody ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
};

const validBody = () => ({
  from: { lat: 27.71, lng: 85.32 },
  to: { lat: 27.714, lng: 85.34 },
});

const makeRoute = (distance, duration) => ({
  distance,
  duration,
  geometry: {
    coordinates: [
      [85.32, 27.71],
      [85.325, 27.711],
      [85.33, 27.712],
      [85.34, 27.714],
    ],
  },
});

await connectTestDB();
server = app.listen(0);
baseURL = `http://127.0.0.1:${server.address().port}`;
const db = mongoose.connection.db;

await db.collection("vendors").deleteMany({ email: { $regex: `^${testPrefix}` } });

const bcrypt = (await import("bcrypt")).default;
const salt = await bcrypt.genSalt(10);
const hashedPassword = await bcrypt.hash("test123456", salt);

const testVendor = await vendorModel.create({
  name: `Route Vendor ${testPrefix}`,
  email: `${testPrefix}-vendor@test.com`,
  phone: String(Date.now() + Math.floor(Math.random() * 10000)).slice(-10),
  password: hashedPassword,
  hasSetLocation: true,
  location: { type: "Point", coordinates: [85.32, 27.71] },
});
const vendorToken = jwt.sign({ id: testVendor._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

// Stub axios.get so the suite never hits the public routing instances. Each
// call pops the next handler from the queue, so every test pre-loads exactly
// the responses it expects. `osrmCalls` records the URLs for assertions.
const realGet = axios.get;
const osrmCalls = [];
let handlers = [];
axios.get = async (url, config) => {
  osrmCalls.push({ url, config });
  const handler = handlers.shift();
  if (!handler) throw new Error("Unexpected OSRM call");
  const result = handler(url);
  if (result instanceof Error) throw result;
  return { data: result };
};

try {
  console.log("\nA1. Unauthenticated / invalid token");

  const r1 = await api("POST", "/api/vendors/route", validBody(), undefined);
  assert(r1.status === 401, "No token returns 401");
  const badToken = jwt.sign({ id: new mongoose.Types.ObjectId() }, "wrong-secret");
  const r2 = await api("POST", "/api/vendors/route", validBody(), badToken);
  assert(r2.status === 401, "Invalid token returns 401");
  assert(osrmCalls.length === 0, "No OSRM call made when auth fails");

  console.log("\nA2. Invalid / missing coordinates");

  handlers = [() => makeRoute(2500, 600)];
  const r3 = await api("POST", "/api/vendors/route", {
    from: { lat: 91, lng: 85.32 },
    to: validBody().to,
  }, vendorToken);
  assert(r3.status === 400, "lat > 90 returns 400");

  handlers = [() => makeRoute(2500, 600)];
  const r4 = await api("POST", "/api/vendors/route", {
    from: { lat: 27.71, lng: 181 },
    to: validBody().to,
  }, vendorToken);
  assert(r4.status === 400, "lng > 180 returns 400");

  handlers = [() => makeRoute(2500, 600)];
  const r5 = await api("POST", "/api/vendors/route", {
    from: { lat: "abc", lng: 85.32 },
    to: validBody().to,
  }, vendorToken);
  assert(r5.status === 400, "non-numeric lat returns 400");

  handlers = [() => makeRoute(2500, 600)];
  const r6 = await api("POST", "/api/vendors/route", {
    from: { lat: 27.71, lng: 85.32 },
    to: {},
  }, vendorToken);
  assert(r6.status === 400, "empty destination returns 400");

  handlers = [() => makeRoute(2500, 600)];
  const r7 = await api("POST", "/api/vendors/route", {}, vendorToken);
  assert(r7.status === 400, "missing from/to returns 400");
  assert(osrmCalls.length === 0, "No OSRM call made for invalid coordinates");

  console.log("\nA3. Valid request → shape the client consumes");

  handlers = [() => ({ routes: [makeRoute(2500, 600)] })];
  const ok = await api("POST", "/api/vendors/route", validBody(), vendorToken);
  assert(ok.status === 200, "Valid request returns 200");
  assert(ok.data.success === true, "Returns success=true");
  assert(typeof ok.data.data?.distance === "number", "data.distance is a number");
  assert(typeof ok.data.data?.duration === "number", "data.duration is a number");
  const coords = ok.data.data?.geometry?.coordinates;
  assert(Array.isArray(coords) && coords.length >= 2, "data.geometry.coordinates is an array of ≥2 points");
  assert(Array.isArray(coords[0]) && coords[0].length === 2, "coordinates are [lng, lat] pairs");
  assert(ok.data.data.distance === 2500 && ok.data.data.duration === 600, "distance/duration echoed");

  console.log("\nA4. OSRM URL shape + provider fallback order");

  const call = osrmCalls[osrmCalls.length - 1];
  assert(typeof call.url === "string" && call.url.startsWith("https://router.project-osrm.org/route/v1/driving/"), "First provider is router.project-osrm.org");
  assert(
    call.url.includes("85.32,27.71;85.34,27.714"),
    "URL encodes lng,lat origin→drop-off pairs"
  );
  assert(
    call.url.includes("overview=full") &&
      call.url.includes("geometries=geojson") &&
      call.url.includes("alternatives=true"),
    "Same routing params the old client sent are used"
  );
  assert(typeof call.config?.timeout === "number", "OSRM call carries a timeout");

  console.log("\nA5. First provider down → falls through to the second");

  handlers = [
    () => new Error("provider down"),
    () => ({ routes: [makeRoute(3200, 700)] }),
  ];
  const fb = await api("POST", "/api/vendors/route", validBody(), vendorToken);
  assert(fb.status === 200, "Fallback provider still returns 200");
  assert(fb.data.data.distance === 3200, "Route served from the second provider");
  const lastTwo = osrmCalls.slice(-2).map((c) => c.url);
  assert(
    lastTwo[0].startsWith("https://router.project-osrm.org/") &&
      lastTwo[1].startsWith("https://routing.openstreetmap.de/routed-car/"),
    "Tried project-osrm first, then openstreetmap.de"
  );

  console.log("\nA6. Path of least distance");

  handlers = [
    () => ({
      routes: [
        makeRoute(5000, 1100),
        makeRoute(2500, 600),
        makeRoute(4000, 900),
      ],
    }),
  ];
  const min = await api("POST", "/api/vendors/route", validBody(), vendorToken);
  assert(min.status === 200, "Multi-alternative request returns 200");
  assert(min.data.data.distance === 2500, "Shortest route alternative selected");
  assert(min.data.data.duration === 600, "Duration matches the selected route");

  console.log("\nA7. All providers down → 502");

  handlers = [() => new Error("down"), () => new Error("down")];
  const no = await api("POST", "/api/vendors/route", validBody(), vendorToken);
  assert(no.status === 502, "All providers failing returns 502");

  console.log("\nCleaning up test data...");
  await db.collection("vendors").deleteMany({ _id: testVendor._id });
  console.log("Cleanup done");
} finally {
  axios.get = realGet;
}

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"=".repeat(50)}`);

server.close();
await disconnectTestDB();
process.exit(failed > 0 ? 1 : 0);