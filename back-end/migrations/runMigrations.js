import * as m001 from "./001-vendor-location-backfill.js";
import * as m002 from "./002-order-nepali-names-backfill.js";
import * as m003 from "./003-order-units-backfill.js";
import * as m004 from "./004-order-payment-fields-backfill.js";
import * as m005 from "./005-order-priority-stage-backfill.js";
import * as m006 from "./006-vendor-payout-backfill.js";
import * as m007 from "./007-finance-permission-backfill.js";
import * as m008 from "./008-encrypt-existing-payout-numbers.js";

const MIGRATIONS = [
  { id: "001-vendor-location-backfill", mod: m001 },
  { id: "002-order-nepali-names-backfill", mod: m002 },
  { id: "003-order-units-backfill", mod: m003 },
  { id: "004-order-payment-fields-backfill", mod: m004 },
  { id: "005-order-priority-stage-backfill", mod: m005 },
  { id: "006-vendor-payout-backfill", mod: m006 },
  { id: "007-finance-permission-backfill", mod: m007 },
  { id: "008-encrypt-existing-payout-numbers", mod: m008 },
];

const runMigrations = async (db) => {
  const collection = db.collection("migrations");

  for (const { id, mod } of MIGRATIONS) {
    const already = await collection.findOne({ _id: id });
    if (already) {
      console.log(`Migration ${id} already ran — skipping`);
      continue;
    }

    console.log(`Running migration ${id}`);
    try {
      await mod.run(db);
      await collection.insertOne({ _id: id, completedAt: new Date() });
    } catch (err) {
      console.error(`Migration ${id} failed:`, err.message);
    }
  }
};

export default runMigrations;
