/**
 * Item image upload hardening tests — run with:
 *   node --env-file-if-exists=.env test/itemUpload.test.js
 *
 * Verifies SEC-003: item image uploads are restricted to whitelisted
 * image types, bounded in size, and named with an opaque server-generated
 * filename (no client input influences the stored path).
 *  1. Valid PNG upload succeeds, item stores the opaque filename, and the
 *     file is retrievable via the /images static route.
 *  2. Non-image MIME type is rejected with a clear error.
 *  3. Oversized file is rejected with a clear error.
 *  4. A filename containing path-traversal characters does not affect the
 *     stored path — the file lands inside the uploads directory.
 */

import "dotenv/config";
import dns from "node:dns";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import express from "express";
import jwt from "jsonwebtoken";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

import adminModel from "../models/adminModel.js";
import itemModel from "../models/itemModel.js";
import itemRouter from "../routes/itemRouter.js";

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("MONGO_URI not set — cannot run item upload tests");
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

// ── Test app (mirrors server.js: /images serves the uploads dir) ──
const app = express();
app.use("/images", express.static("uploads"));
app.use("/api/items", itemRouter);

let server;
let baseURL;
const testPrefix = `_test_itemupload_${Date.now()}`;

import { connectTestDB, disconnectTestDB } from "./helpers/testDb.js";

await connectTestDB();
server = app.listen(0);
baseURL = `http://127.0.0.1:${server.address().port}`;
const db = mongoose.connection.db;

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

const makeItem = async () =>
  itemModel.create({
    nameEng: `${testPrefix}-item`,
    nameNep: `${testPrefix}-item-np`,
    unitEng: "kg",
    unitNep: "केजी",
    minPrice: 10,
    maxPrice: 20,
    avgPrice: 15,
    minPriceNep: "१०",
    maxPriceNep: "२०",
    avgPriceNep: "१५",
    status: true,
    available: true,
    image: "existing-preview.jpg",
  });

const trackFile = (filename) => filename && fs.existsSync(path.join("uploads", filename));
const uploadedNames = [];

const uploadImage = async (itemId, blob, originalname) => {
  const formData = new FormData();
  formData.append("nameEng", `${testPrefix}-item`);
  formData.append("nameNep", `${testPrefix}-item-np`);
  formData.append("minPrice", "10");
  formData.append("avgPrice", "15");
  formData.append("maxPrice", "20");
  formData.append("image", blob, originalname);

  const res = await fetch(`${baseURL}/api/items/edit/${itemId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: formData,
  });
  return { status: res.status, data: await res.json() };
};

// A 1x1 PNG. Valid image bytes; the .svg-renamed-to-.png spoof case is
// out of scope for this task (noted as a possible follow-up).
const realPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

// ──────────────────────────────────────────────────────────────
const knownItem = await makeItem();

console.log("\n1. Valid image upload succeeds and is retrievable");
const valid = await uploadImage(knownItem._id, new Blob([realPng], { type: "image/png" }), "photo.png");
assert(valid.status === 200, "PATCH returns 200");
assert(valid.data.success === true, "Returns success=true");
const storedImage = valid.data.data.image;
assert(typeof storedImage === "string" && /^[a-f0-9-]{36}\.png$/.test(storedImage), `Opaque UUID filename stored (got "${storedImage}")`);
assert(!/[/\\]/.test(storedImage) && !storedImage.includes(".."), "Stored filename contains no path separators or '..'");
assert(/^photo\.png$/.test("photo.png") && !storedImage.includes("photo"), "Client originalname is not used in the stored filename");

const fetched = await fetch(`${baseURL}/images/${storedImage}`);
assert(fetched.status === 200, "Uploaded file is retrievable at /images/<name>");
assert((fetched.headers.get("content-type") || "").startsWith("image/png"), "Served with image/png content type");
uploadedNames.push(storedImage);

// ──────────────────────────────────────────────────────────────
console.log("\n2. Non-image MIME type is rejected");
const badMimeItem = await makeItem();
const badMime = await uploadImage(badMimeItem._id, new Blob(["hello"], { type: "text/plain" }), "image.png");
assert(badMime.status === 400, "Non-image MIME returns 400");
assert(badMime.data.success === false, "Returns success=false");
assert(/JPG|JPEG|PNG|WebP/.test((badMime.data.message || "")), `Clear rejection message ("${badMime.data.message}")`);

// Bad extension but valid image MIME (spoof-by-extension attempt)
const badExtItem = await makeItem();
const badExt = await uploadImage(badExtItem._id, new Blob([realPng], { type: "image/png" }), "photo.txt");
assert(badExt.status === 400, "Non-whitelisted extension returns 400");
assert(/extensions?/.test((badExt.data.message || "")), `Clear extension rejection message ("${badExt.data.message}")`);

// ensure a rejected upload did not change the stored image
const reloadBad = await itemModel.findById(badMimeItem._id);
assert(reloadBad.image === "existing-preview.jpg", "Stored image unchanged after rejected upload");

// ──────────────────────────────────────────────────────────────
console.log("\n3. Oversized file is rejected");
const bigItem = await makeItem();
const bigFile = Buffer.alloc(5 * 1024 * 1024 + 1);
const oversize = await uploadImage(bigItem._id, new Blob([bigFile], { type: "image/png" }), "big.png");
assert(oversize.status === 400, "Oversized file returns 400");
assert(oversize.data.success === false, "Returns success=false");
assert(/too large/i.test((oversize.data.message || "")), `Clear size rejection message ("${oversize.data.message}")`);
const reloadBig = await itemModel.findById(bigItem._id);
assert(reloadBig.image === "existing-preview.jpg", "Stored image unchanged after oversize rejection");

// ──────────────────────────────────────────────────────────────
console.log("\n4. Path-traversal filename cannot influence the stored path");
const traversalItem = await makeItem();
const traversal = await uploadImage(
  traversalItem._id,
  new Blob([realPng], { type: "image/png" }),
  "../../escape.png"
);
assert(traversal.status === 200, "Upload with traversal filename still succeeds (valid image)");
const traversalImage = traversal.data.data.image;
assert(/^[a-f0-9-]{36}\.png$/.test(traversalImage), `Stored filename is opaque ("${traversalImage}")`);
assert(trackFile(traversalImage), "Stored file exists inside the uploads directory");
const resolvedStored = path.resolve(path.join("uploads", traversalImage));
assert(resolvedStored.startsWith(path.resolve("uploads") + path.sep), "Resolved stored path stays inside the uploads directory");
assert(!fs.existsSync(path.resolve("uploads", "..", "..", "escape.png")) && !fs.existsSync("escape.png"), "No file escaped the uploads directory");
uploadedNames.push(traversalImage);

// ──────────────────────────────────────────────────────────────
// Cleanup
// ──────────────────────────────────────────────────────────────
console.log("\nCleaning up test data...");
for (const name of uploadedNames) {
  try {
    fs.unlinkSync(path.join("uploads", name));
  } catch (_) {}
}
await db.collection("admins").deleteMany({ _id: testAdmin._id });
await db.collection("items").deleteMany({ nameEng: { $regex: `^${testPrefix}` } });
console.log("Cleanup done");

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"=".repeat(50)}`);

server.close();
await disconnectTestDB();
process.exit(failed > 0 ? 1 : 0);