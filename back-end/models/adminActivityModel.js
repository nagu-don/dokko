import mongoose from "mongoose";

const adminActivitySchema = new mongoose.Schema({
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "admin",
    required: true,
    index: true,
  },
  action: {
    type: String,
    required: true,
    enum: [
      "login",
      "logout",
      "approve_admin",
      "reject_admin",
      "remove_admin",
      "create_product",
      "update_product",
      "delete_product",
      "update_order",
      "create_settlement",
      "approve_settlement",
      "mark_settlement_paid",
      "cancel_settlement",
      "update_settings",
      "post_notice",
      "delete_notice",
      "other",
    ],
  },
  description: {
    type: String,
    default: "",
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, { timestamps: true });

adminActivitySchema.index({ adminId: 1, createdAt: -1 });
adminActivitySchema.index({ createdAt: -1 });

const adminActivityModel = mongoose.model("adminactivities", adminActivitySchema);
export default adminActivityModel;
