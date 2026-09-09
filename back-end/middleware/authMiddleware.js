import jwt from "jsonwebtoken";
import userModel from "../models/userModel.js";
import adminModel from "../models/adminModel.js";
import vendorModel from "../models/vendorModel.js";

const getTokenFrom = (req) => {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
};

const makeAuthMiddleware = (Model, role) => async (req, res, next) => {
  try {
    const token = getTokenFrom(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: `Please log in as ${role} to continue`,
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const account = await Model.findById(decoded.id).catch(() => null);

    if (!account) {
      return res.status(401).json({
        success: false,
        message: `This is a ${role}-only action. Please log in with a ${role} account.`,
      });
    }

    req.account = account;
    req.accountRole = role;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: "Session expired or invalid. Please log in again.",
    });
  }
};

// tokens issued for a user only work as user, admin only as admin
export const authUser = makeAuthMiddleware(userModel, "user");
export const authAdmin = makeAuthMiddleware(adminModel, "admin");
export const authVendor = makeAuthMiddleware(vendorModel, "vendor");

// finance-gated admin actions (settlement approve/pay) — composes on top of
// authAdmin and additionally requires the finance permission. Re-checks the
// database on every request, so revoking the permission takes effect
// immediately even for already-issued tokens.
export const authFinanceAdmin = async (req, res, next) => {
  await authAdmin(req, res, () => {
    if (!req.account || req.account.canManageFinance !== true) {
      return res.status(403).json({
        success: false,
        message: "Finance permission required for this action",
      });
    }
    next();
  });
};
