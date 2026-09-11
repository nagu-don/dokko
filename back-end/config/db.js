import mongoose from "mongoose";
import dns from "node:dns";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import adminModel from "../models/adminModel.js";
import runMigrations from "../migrations/runMigrations.js";
import bcrypt from "bcrypt";
import logger from "../utils/logger.js";
import { logSystemIssue } from "../utils/systemIssue.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dns.setServers([
  "8.8.8.8",
  "8.8.4.4"
]);

const PRIME_ADMIN_NAME = "Prime Admin";
const PRIME_ADMIN_EMAIL = "prime@admin";
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
        logger.info("PRIME_ADMIN_ID added to .env file");
      }
      return;
    }

    // Determine the bootstrap password:
    // 1. Use PRIME_ADMIN_BOOTSTRAP_PASSWORD from the environment if set.
    // 2. Otherwise generate a cryptographically random 20-char password.
    const useEnvPassword = process.env.PRIME_ADMIN_BOOTSTRAP_PASSWORD;
    let primeAdminPassword;
    let mustChangePassword;

    if (useEnvPassword) {
      primeAdminPassword = useEnvPassword;
      mustChangePassword = false;
    } else {
      primeAdminPassword = crypto.randomBytes(15).toString("base64url");
      mustChangePassword = true;
      logger.info(
        "Prime admin bootstrap password (save this now, it will not be shown again): " +
          primeAdminPassword
      );
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(primeAdminPassword, salt);

    const primeAdmin = await adminModel.create({
      name: PRIME_ADMIN_NAME,
      email: PRIME_ADMIN_EMAIL,
      phone: PRIME_ADMIN_PHONE,
      password: hashedPassword,
      status: "active",
      canManageFinance: true,
      mustChangePassword,
    });

    logger.info(`Prime admin account created: ${primeAdmin.email}`);

    const envLine = `PRIME_ADMIN_ID=${primeAdmin._id.toString()}`;
    if (!envContent.includes("PRIME_ADMIN_ID=")) {
      fs.appendFileSync(envPath, `\n${envLine}\n`);
      logger.info("PRIME_ADMIN_ID saved to .env file");
    }
  } catch (err) {
    logger.error({ err }, "Failed to ensure prime admin account");
    logSystemIssue("Failed to ensure prime admin account", {
      severity: "high",
      metadata: { error: err?.message },
    });
  }
};

export const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is not set in the environment variables");
    }

    await mongoose.connect(process.env.MONGO_URI);
    logger.info("DB connected");

    if (!mongoose.connection.db) {
      throw new Error("Mongoose connected but db instance is not available");
    }

    await ensurePrimeAdmin();

    await runMigrations(mongoose.connection.db);

    // indexes are auto-created by Mongoose from model schemas

  } catch (err) {
    logger.error({ err }, "Failed to connect to database");
  }
};
