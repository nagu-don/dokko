import mongoose from "mongoose";
import dns from "node:dns";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KATHMANDU_COORDS } from "../models/vendorModel.js";
import adminModel from "../models/adminModel.js";
import bcrypt from "bcrypt";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dns.setServers([
  "8.8.8.8",
  "8.8.4.4"
]);

const PRIME_ADMIN_NAME = "Prime Admin";
const PRIME_ADMIN_EMAIL = "prime@admin";
const PRIME_ADMIN_PASSWORD = "RUC+n5s2y!0HNP)";
const PRIME_ADMIN_PHONE = "9800000001";

const ensurePrimeAdmin = async () => {
  try {
    const envPath = path.resolve(__dirname, "..", ".env");
    const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

    const existingPrimeAdmin = await adminModel.findOne({ email: PRIME_ADMIN_EMAIL });

    if (existingPrimeAdmin) {
      const envLine = `PRIME_ADMIN_ID=${existingPrimeAdmin._id.toString()}`;
      if (!envContent.includes("PRIME_ADMIN_ID=")) {
        fs.appendFileSync(envPath, `\n${envLine}\n`);
        console.log("PRIME_ADMIN_ID added to .env file");
      }
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(PRIME_ADMIN_PASSWORD, salt);

    const primeAdmin = await adminModel.create({
      name: PRIME_ADMIN_NAME,
      email: PRIME_ADMIN_EMAIL,
      phone: PRIME_ADMIN_PHONE,
      password: hashedPassword,
      status: "active",
    });

    console.log(`Prime admin account created: ${primeAdmin.email}`);

    const envLine = `PRIME_ADMIN_ID=${primeAdmin._id.toString()}`;
    if (!envContent.includes("PRIME_ADMIN_ID=")) {
      fs.appendFileSync(envPath, `\n${envLine}\n`);
      console.log("PRIME_ADMIN_ID saved to .env file");
    }
  } catch (err) {
    console.error("Failed to ensure prime admin account:", err.message);
  }
};

export const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("DB connected");

    await ensurePrimeAdmin();

    // one-time backfill — vendors created before locations existed would be
    // invisible to $geoNear; give them the Kathmandu default (hasSetLocation
    // stays false so they're still nudged to pick a real spot)
    const { modifiedCount } = await mongoose.connection.db
      .collection("vendors")
      .updateMany(
        { location: { $exists: false } },
        {
          $set: {
            location: { type: "Point", coordinates: KATHMANDU_COORDS },
            hasSetLocation: false,
          },
        }
      );
    if (modifiedCount > 0) {
      console.log(`Backfilled working location for ${modifiedCount} vendor(s)`);
    }

    // one-time backfill — orders placed before item snapshots carried Nepali
    // names would fall back to English in the vendor app; copy them over
    // from the items collection by matching nameEng
    const itemDocs = await mongoose.connection.db
      .collection("items")
      .find({}, { projection: { nameEng: 1, nameNep: 1 } })
      .toArray();
    const nepByName = new Map(
      itemDocs.filter((i) => i.nameNep).map((i) => [i.nameEng, i.nameNep])
    );

    if (nepByName.size > 0) {
      const stale = await mongoose.connection.db
        .collection("orders")
        .find({ "items.nameNep": { $in: [null, ""] } })
        .toArray();

      let fixedOrders = 0;
      for (const order of stale) {
        const items = (order.items || []).map((row) => ({
          ...row,
          nameNep: row.nameNep || nepByName.get(row.nameEng) || "",
        }));
        await mongoose.connection.db
          .collection("orders")
          .updateOne({ _id: order._id }, { $set: { items } });
        fixedOrders += 1;
      }
      if (fixedOrders > 0) {
        console.log(`Backfilled Nepali item names into ${fixedOrders} order(s)`);
      }
    }

    // one-time backfill — orders placed before payment fields existed
    // need paymentStatus and paymentMethod set so queries and indexes
    // work consistently across old and new records
    const { modifiedCount: paymentBackfill } = await mongoose.connection.db
      .collection("orders")
      .updateMany(
        { paymentStatus: { $exists: false } },
        {
          $set: {
            paymentStatus: "unpaid",
            paymentMethod: null,
          },
        }
      );
    if (paymentBackfill > 0) {
      console.log(`Backfilled payment fields into ${paymentBackfill} order(s)`);
    }

    // one-time backfill — vendors created before payout fields existed
    const { modifiedCount: payoutBackfill } = await mongoose.connection.db
      .collection("vendors")
      .updateMany(
        { payoutMethod: { $exists: false } },
        {
          $set: {
            payoutMethod: null,
            payoutBankName: null,
            payoutAccountNumber: null,
            payoutAccountHolder: null,
          },
        }
      );
    if (payoutBackfill > 0) {
      console.log(`Backfilled payout fields into ${payoutBackfill} vendor(s)`);
    }

    // one-time backfill — orders placed before priority search existed
    // All pre-existing orders are treated as already assigned (legacy):
    //   - set priorityStage = "ASSIGNED"
    //   - set priorityStartedAt = createdAt (when the order was placed)
    //   - keep existing deliveryCharge untouched (already has a value)
    const { modifiedCount: priorityBackfill } = await mongoose.connection.db
      .collection("orders")
      .updateMany(
        { priorityStage: { $exists: false } },
        [
          {
            $set: {
              priorityStage: "ASSIGNED",
              priorityStartedAt: "$createdAt",
              priorityExpiresAt: null,
            },
          },
        ]
      );
    if (priorityBackfill > 0) {
      console.log(`Backfilled priority search fields into ${priorityBackfill} order(s)`);
    }

    // indexes are auto-created by Mongoose from model schemas

  } catch (err) {
    console.error(err);
  }
};
