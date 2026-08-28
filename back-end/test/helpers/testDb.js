/**
 * Test-database isolation helpers.
 *
 * Guarantees that integration tests NEVER run against the normal
 * development/production database.  Tests must:
 *
 *   1. call connectTestDB() which derives a dedicated test URI
 *      (a `TEST_MONGO_URI` env var, or MONGO_URI with the database
 *      name replaced by `*_test`);
 *   2. assert the connected database name ends in `_test` (or is an
 *      explicitly allow-listed test DB) — otherwise it aborts;
 *   3. use the fixture helpers below so tests create and destroy only
 *      their own uniquely-prefixed records.
 *
 * Never call `deleteMany({})` on the normal application database.
 */

import "dotenv/config";
import dns from "node:dns";
import mongoose from "mongoose";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

const TEST_DB_SUFFIX = "_test";

const DEVTEST_DEPTH = 2;

// The database name (the URI path segment) of the current MONGO_URI.
// Used only to derive a safe test URI — never to connect to directly.
const uriDbName = (uri) => {
  try {
    const m = new URL(uri);
    const dbName = m.pathname.replace(/^\//, "").split("?")[0];
    return dbName;
  } catch {
    return null;
  }
};

/**
 * Build the test Mongo URI.
 * Priority:
 *   1. TEST_MONGO_URI (explicit — must still pass the safety check)
 *   2. MONGO_URI with the database name changed to `<name>_test`
 * Returns null when no usable source exists.
 */
export const getTestMongoURI = () => {
  if (process.env.TEST_MONGO_URI) {
    return process.env.TEST_MONGO_URI;
  }
  if (!process.env.MONGO_URI) return null;

  const dbName = uriDbName(process.env.MONGO_URI);
  if (!dbName) return null;
  if (dbName.endsWith(TEST_DB_SUFFIX)) {
    // development URI already points at a test DB — allow it
    return process.env.MONGO_URI;
  }
  return process.env.MONGO_URI.replace(`/${dbName}`, `/${dbName}${TEST_DB_SUFFIX}`);
};

/**
 * Fail the whole test run loudly if the safety checks fail.
 */
const abort = (msg) => {
  console.error("\n[TEST-DB SAFETY] " + msg);
  console.error("[TEST-DB SAFETY] Refusing to run tests. No data was touched.\n");
  process.exit(1);
};

/**
 * Connect to the dedicated test database and verify it is safe to use.
 * Aborts if:
 *   - no MONGO_URI/TEST_MONGO_URI is configured;
 *   - the database name does not end in `_test` (unless explicitly
 *     allow-listed via ISOLATED_TEST_DB);
 *   - the database name is empty.
 */
export const connectTestDB = async () => {
  const uri = getTestMongoURI();

  if (!uri) {
    abort("No TEST_MONGO_URI or MONGO_URI found. Cannot determine a test database.");
  }

  const dbName = uriDbName(uri);
  if (!dbName) {
    abort(`Could not parse a database name from the test URI.`);
  }

  const explicitlyAllowed = (process.env.ISOLATED_TEST_DB || "").split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const isTestDb = dbName.endsWith(TEST_DB_SUFFIX) || explicitlyAllowed.includes(dbName);

  if (!isTestDb) {
    abort(
      `Derived database "${dbName}" does not look like a test database ` +
        `(name must end in "${TEST_DB_SUFFIX}"). ` +
        `If this is intentional, set ISOLATED_TEST_DB="${dbName}".`
    );
  }

  await mongoose.connect(uri);
  const connectedName = mongoose.connection.name;

  if (!(connectedName.endsWith(TEST_DB_SUFFIX) || explicitlyAllowed.includes(connectedName))) {
    abort(`Connected to "${connectedName}" which is NOT a test database.`);
  }

  console.log(`[TEST-DB] Connected to test database: ${connectedName}`);
  return mongoose.connection;
};

export const disconnectTestDB = async () => {
  await mongoose.disconnect();
};

// ── fixture helpers ──────────────────────────────────────────────
// Every fixture name is prefixed so that cleanup never affects
// unrelated records that happen to live in the test database.

let seq = 0;
export const makePrefix = (label = "t") => `${label}_test_${Date.now()}_${seq++}`;

/**
 * Create a clean test database context: wipes ONLY records whose
 * names carry the given prefix (or the auto-generated one).  Safe to
 * run repeatedly; it never deletes unrelated data.
 */
export class TestDbContext {
  constructor(model, prefixField, prefix) {
    this.model = model;
    this.prefixField = prefixField;
    this.prefix = prefix || makePrefix();
  }

  async cleanup() {
    const filter = { [this.prefixField]: { $regex: `^${this.prefix}` } };
    await this.model.deleteMany(filter);
  }
}
