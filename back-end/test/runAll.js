/**
 * Safe full-suite test runner.
 *
 * Runs every `test/*.test.js` suite sequentially against an ISOLATED
 * test database — NEVER the normal application database.
 *
 * How isolation works:
 *   - The target database name is derived from TEST_MONGO_URI, or by
 *     replacing the database name in MONGO_URI with `<name>_test`.
 *   - As a hard safety guard, the runner refuses to proceed unless the
 *     resolved database name ends in `_test` (or is explicitly
 *     allow-listed via ISOLATED_TEST_DB).
 *   - `MONGO_URI` is then overridden to that test URI for every child
 *     suite, so even suites that were written to `mongoose.connect(MONGO_URI)`
 *     land on the test database.
 *
 * Repeated runs are safe: fixture-only suites clean up after themselves,
 * and the test database is disposable by design.
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTestMongoURI } from "./helpers/testDb.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const testUri = getTestMongoURI();
const dbName = new URL(testUri.replace(/^mongodb\+srv:\/\//, "mongodb://")).pathname.replace(/^\//, "");

if (
  !/\.*_test$/.test(dbName) &&
  !(process.env.ISOLATED_TEST_DB && process.env.ISOLATED_TEST_DB.split(",").includes(dbName))
) {
  console.error(
    `[test-runner] REFUSED: resolved test database name "${dbName}" does not end in "_test". ` +
      `Cowardly refusing to run the suite against a non-test database.`
  );
  process.exit(1);
}

console.log(`[test-runner] Isolated test database: ${dbName}`);

const files = readdirSync(__dirname)
  .filter((f) => f.endsWith(".test.js"))
  .sort();

let failed = 0;
for (const file of files) {
  const runner = path.join(__dirname, file);
  console.log(`\n================ RUN ${file} ================`);
  try {
    execFileSync(
      process.execPath,
      ["--env-file-if-exists=.env", runner],
      {
        stdio: "inherit",
        env: { ...process.env, MONGO_URI: testUri },
      }
    );
    console.log(`================ PASS ${file} ================`);
  } catch (e) {
    failed++;
    // execFileSync throws with no useful payload on non-zero exit; the
    // child's stderr/stdout are already shown via stdio:"inherit".
    if (e.status) {
      console.log(`================ FAIL ${file} (exit ${e.status}) ================`);
    }
  }
}

console.log(`\n[test-runner] ${files.length - failed}/${files.length} suites passed`);
process.exit(failed === 0 ? 0 : 1);
