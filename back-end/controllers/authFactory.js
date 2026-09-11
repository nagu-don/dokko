import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { isValidEmail, isStrongPassword } from "../utils/validators.js";
import logger from "../utils/logger.js";

// normalizes a phone input to bare digits, e.g. "9841-00-0000" -> "9841000000"
const normalizePhone = (phone) => String(phone ?? "").replace(/\D/g, "");

const buildAuthController = (Model) => {
  const register = async (req, res) => {
    try {
      const { name, email, password } = req.body;
      const phone = normalizePhone(req.body.phone);

      if (!name || !email || !password || !phone) {
        return res.status(400).json({
          success: false,
          message: "Name, email, phone and password are required",
        });
      }

      if (!isValidEmail(email)) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid email address",
        });
      }

      if (!/^\d{10}$/.test(phone)) {
        return res.status(400).json({
          success: false,
          message: "Phone number must be exactly 10 digits",
        });
      }

      if (!isStrongPassword(password)) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 8 characters and include a mix of letters, numbers, or symbols",
        });
      }

      const existingEmail = await Model.findOne({ email });
      if (existingEmail) {
        return res.status(409).json({
          success: false,
          message: "An account with this email already exists",
        });
      }

      const existingPhone = await Model.findOne({ phone });
      if (existingPhone) {
        return res.status(409).json({
          success: false,
          message: "An account with this phone number already exists",
        });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const account = await Model.create({
        name,
        email,
        phone,
        password: hashedPassword,
      });

      const token = jwt.sign(
        { id: account._id },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.status(201).json({
        success: true,
        message: "Account created successfully",
        token,
        user: {
          id: account._id,
          name: account.name,
          email: account.email,
          phone: account.phone,
        },
      });
    } catch (error) {
      // duplicate key race on the unique indexes
      if (error instanceof mongoose.Error.ValidationError) {
        return res.status(400).json({
          success: false,
          message: Object.values(error.errors)[0]?.message || "Invalid data",
        });
      }
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: "An account with this email or phone already exists",
        });
      }

      logger.error({ err: error }, "Failed to create account");
      res.status(500).json({
        success: false,
        message: "Failed to create account",
      });
    }
  };

  const login = async (req, res) => {
    try {
      // accepts either an email address or a 10-digit phone number
      const identifier = String(req.body.identifier ?? req.body.email ?? "").trim();
      const { password } = req.body;

      if (!identifier || !password) {
        return res.status(400).json({
          success: false,
          message: "Email/phone and password are required",
        });
      }

      // no "@" + exactly 10 digits → look up by phone, otherwise by email
      const digits = identifier.replace(/\D/g, "");
      const query =
        !identifier.includes("@") && /^\d{10}$/.test(digits)
          ? { phone: digits }
          : { email: identifier.toLowerCase() };

      const account = await Model.findOne(query);
      if (!account) {
        return res.status(401).json({
          success: false,
          message: "Invalid email/phone or password",
        });
      }

      const match = await bcrypt.compare(password, account.password);
      if (!match) {
        return res.status(401).json({
          success: false,
          message: "Invalid email/phone or password",
        });
      }

      const token = jwt.sign(
        { id: account._id },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.json({
        success: true,
        message: "Logged in successfully",
        token,
        user: {
          id: account._id,
          name: account.name,
          email: account.email,
          phone: account.phone,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "Failed to log in");
      res.status(500).json({
        success: false,
        message: "Failed to log in",
      });
    }
  };

  return { register, login };
};

export default buildAuthController;
