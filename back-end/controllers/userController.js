import userModel from "../models/userModel.js";
import orderModel from "../models/orderModel.js";
import buildAuthController from "./authFactory.js";
import buildGoogleAuthController from "./googleAuthFactory.js";

const { register: registerUser, login: loginUser } = buildAuthController(userModel);
const { googleAuth: googleAuthUser } = buildGoogleAuthController(userModel);

const normalizePhone = (phone) => String(phone ?? "").replace(/\D/g, "");

// USER — get own profile
const getProfile = async (req, res) => {
  try {
    const user = await userModel.findById(req.account._id).select("-password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to fetch profile" });
  }
};

// USER — update phone number
const updatePhone = async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);

    if (!/^\d{10}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Phone number must be exactly 10 digits",
      });
    }

    const existing = await userModel.findOne({ phone, _id: { $ne: req.account._id } });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "This phone number is already in use",
      });
    }

    const user = await userModel.findByIdAndUpdate(
      req.account._id,
      { phone },
      { new: true }
    ).select("-password");

    res.json({ success: true, data: user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to update phone" });
  }
};

// ADMIN — list all registered users + how many orders each has placed
const listUsers = async (req, res) => {
  try {
    const users = await userModel.find().select("-password").sort({ createdAt: -1 });

    const counts = await orderModel.aggregate([
      { $group: { _id: "$user", totalOrders: { $sum: 1 }, totalKg: { $sum: "$totalQuantity" } } },
    ]);

    const byUser = new Map(counts.map((row) => [String(row._id), row]));

    const data = users.map((user) => {
      const stats = byUser.get(String(user._id));
      return {
        ...user.toObject(),
        totalOrders: stats?.totalOrders || 0,
        totalKgOrdered: Math.round((stats?.totalKg || 0) * 10) / 10,
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
};

export { registerUser, loginUser, googleAuthUser, listUsers, getProfile, updatePhone };
