import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import adminModel, { ADMIN_STATUSES } from "../models/adminModel.js";
import adminActivityModel from "../models/adminActivityModel.js";

const normalizePhone = (phone) => String(phone ?? "").replace(/\D/g, "");

const logAdminActivity = async (adminId, action, description = "", metadata = {}) => {
  try {
    await adminActivityModel.create({ adminId, action, description, metadata });
  } catch (err) {
    console.error("Failed to log admin activity:", err.message);
  }
};

const registerAdmin = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const phone = normalizePhone(req.body.phone);

    if (!name || !email || !password || !phone) {
      return res.status(400).json({
        success: false,
        message: "Name, email, phone and password are required",
      });
    }

    if (!/^\d{10}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Phone number must be exactly 10 digits",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const existingEmail = await adminModel.findOne({ email });
    if (existingEmail) {
      return res.json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    const existingPhone = await adminModel.findOne({ phone });
    if (existingPhone) {
      return res.json({
        success: false,
        message: "An account with this phone number already exists",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const account = await adminModel.create({
      name,
      email,
      phone,
      password: hashedPassword,
      status: "pending",
    });

    res.status(201).json({
      success: true,
      message: "Account created successfully. Awaiting approval from an existing admin.",
      user: {
        id: account._id,
        name: account.name,
        email: account.email,
        phone: account.phone,
        status: account.status,
      },
    });
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      return res.status(400).json({
        success: false,
        message: Object.values(error.errors)[0]?.message || "Invalid data",
      });
    }
    if (error.code === 11000) {
      return res.json({
        success: false,
        message: "An account with this email or phone already exists",
      });
    }

    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to create account",
    });
  }
};

const PRIME_ADMIN_EMAIL = "prime@admin";

const loginAdmin = async (req, res) => {
  try {
    const identifier = String(req.body.identifier ?? req.body.email ?? "").trim();
    const { password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: "Email/phone and password are required",
      });
    }

    let query;
    if (identifier.toLowerCase() === PRIME_ADMIN_EMAIL) {
      query = { email: PRIME_ADMIN_EMAIL };
    } else {
      const digits = identifier.replace(/\D/g, "");
      query =
        !identifier.includes("@") && /^\d{10}$/.test(digits)
          ? { phone: digits }
          : { email: identifier.toLowerCase() };
    }

    const account = await adminModel.findOne(query);
    if (!account) {
      return res.json({
        success: false,
        message: "Invalid email/phone or password",
      });
    }

    if (account.status === "pending") {
      return res.status(403).json({
        success: false,
        message: "Your account is pending approval. Please wait for an existing admin to approve your account.",
      });
    }

    if (account.status === "rejected") {
      return res.status(403).json({
        success: false,
        message: "Your account has been rejected. Contact an existing admin for more information.",
      });
    }

    const match = await bcrypt.compare(password, account.password);
    if (!match) {
      return res.json({
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
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to log in",
    });
  }
};

const listPendingAdmins = async (req, res) => {
  try {
    const pending = await adminModel
      .find({ status: "pending" }, { password: 0 })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: pending,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to load pending admins",
    });
  }
};

const approveAdmin = async (req, res) => {
  try {
    const adminToApprove = await adminModel.findById(req.params.id);

    if (!adminToApprove) {
      return res.status(404).json({
        success: false,
        message: "Admin account not found",
      });
    }

    if (adminToApprove.status !== "pending") {
      return res.status(409).json({
        success: false,
        message: `Admin account is already ${adminToApprove.status}`,
      });
    }

    adminToApprove.status = "active";
    adminToApprove.approvedByAdminId = req.account._id;
    adminToApprove.approvedAt = new Date();
    if (req.body.adminNote) {
      adminToApprove.adminNote = req.body.adminNote;
    }
    await adminToApprove.save();

    logAdminActivity(req.account._id, "approve_admin", `Approved admin: ${adminToApprove.name} (${adminToApprove.email})`, { targetAdminId: adminToApprove._id });

    res.json({
      success: true,
      message: "Admin account approved",
      data: {
        id: adminToApprove._id,
        name: adminToApprove.name,
        email: adminToApprove.email,
        status: adminToApprove.status,
        approvedAt: adminToApprove.approvedAt,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to approve admin account",
    });
  }
};

const rejectAdmin = async (req, res) => {
  try {
    const adminToReject = await adminModel.findById(req.params.id);

    if (!adminToReject) {
      return res.status(404).json({
        success: false,
        message: "Admin account not found",
      });
    }

    if (adminToReject.status !== "pending") {
      return res.status(409).json({
        success: false,
        message: `Admin account is already ${adminToReject.status}`,
      });
    }

    adminToReject.status = "rejected";
    adminToReject.approvedByAdminId = req.account._id;
    adminToReject.approvedAt = new Date();
    if (req.body.adminNote) {
      adminToReject.adminNote = req.body.adminNote;
    }
    await adminToReject.save();

    logAdminActivity(req.account._id, "reject_admin", `Rejected admin: ${adminToReject.name} (${adminToReject.email})`, { targetAdminId: adminToReject._id });

    res.json({
      success: true,
      message: "Admin account rejected",
      data: {
        id: adminToReject._id,
        name: adminToReject.name,
        email: adminToReject.email,
        status: adminToReject.status,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to reject admin account",
    });
  }
};

const listAllAdmins = async (req, res) => {
  try {
    const admins = await adminModel
      .find({}, { password: 0 })
      .populate("approvedByAdminId", "name email")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: admins,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to load admins",
    });
  }
};

/**
 * GET /api/admins/me
 *
 * Returns the currently authenticated admin's profile (without password).
 * Used by the admin panel to know whether this admin may take
 * finance-only actions (canManageFinance).
 */
const getMe = async (req, res) => {
  try {
    const admin = await adminModel.findById(req.account._id, { password: 0 });
    if (!admin) {
      return res.status(404).json({ success: false, message: "Admin account not found" });
    }
    res.json({ success: true, data: admin });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to load admin profile",
    });
  }
};

/**
 * PATCH /api/admins/finance-permission/:id
 *
 * Grants or revokes `canManageFinance` on another admin. Finance-gated
 * (authFinanceAdmin) — only admins who already hold the finance permission
 * may change it. Refuses to revoke the permission from the last remaining
 * active finance-capable admin, so settlements can never become unpayable.
 */
const updateFinancePermission = async (req, res) => {
  try {
    const target = await adminModel.findById(req.params.id);
    if (!target) {
      return res.status(404).json({ success: false, message: "Admin account not found" });
    }

    const { canManageFinance } = req.body;
    if (typeof canManageFinance !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "canManageFinance must be a boolean",
      });
    }

    if (!canManageFinance) {
      const financeAdminsLeft = await adminModel.countDocuments({
        _id: { $ne: target._id },
        status: "active",
        canManageFinance: true,
      });
      if (financeAdminsLeft === 0) {
        return res.status(409).json({
          success: false,
          message:
            "Cannot revoke finance permission from the last finance-capable admin — settlements would become unpayable",
        });
      }
    }

    target.canManageFinance = canManageFinance;
    await target.save();

    logAdminActivity(
      req.account._id,
      "other",
      `${canManageFinance ? "Granted" : "Revoked"} finance permission ${canManageFinance ? "to" : "from"} ${target.name} (${target.email})`,
      { targetAdminId: target._id, canManageFinance }
    );

    res.json({
      success: true,
      message: canManageFinance
        ? `Finance permission granted to ${target.name}`
        : `Finance permission revoked from ${target.name}`,
      data: {
        id: target._id,
        email: target.email,
        canManageFinance: target.canManageFinance,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to update finance permission",
    });
  }
};

const getAdminActivity = async (req, res) => {
  try {
    const { adminId } = req.params;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const activities = await adminActivityModel
      .find({ adminId, createdAt: { $gte: startOfDay } })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: activities,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to load admin activity",
    });
  }
};

const removeAdmin = async (req, res) => {
  try {
    const adminToRemove = await adminModel.findById(req.params.id);

    if (!adminToRemove) {
      return res.status(404).json({
        success: false,
        message: "Admin account not found",
      });
    }

    if (adminToRemove.email === PRIME_ADMIN_EMAIL) {
      return res.status(403).json({
        success: false,
        message: "Cannot remove the prime admin account",
      });
    }

    await adminModel.findByIdAndDelete(req.params.id);
    await adminActivityModel.deleteMany({ adminId: req.params.id });

    logAdminActivity(req.account._id, "remove_admin", `Removed admin: ${adminToRemove.name} (${adminToRemove.email})`, { targetAdminId: adminToRemove._id });

    res.json({
      success: true,
      message: "Admin account removed successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to remove admin account",
    });
  }
};

export { registerAdmin, loginAdmin, listPendingAdmins, approveAdmin, rejectAdmin, listAllAdmins, getAdminActivity, removeAdmin, getMe, updateFinancePermission };
