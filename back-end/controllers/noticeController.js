import noticeModel from "../models/noticeModel.js";
import adminActivityModel from "../models/adminActivityModel.js";

const logAdminActivity = async (adminId, action, description = "", metadata = {}) => {
  try {
    await adminActivityModel.create({ adminId, action, description, metadata });
  } catch (err) {
    console.error("Failed to log admin activity:", err.message);
  }
};

// ── Admin: post a notice broadcast to all vendors ────────────────────
const createNotice = async (req, res) => {
  try {
    const titleEn = String(req.body.titleEn ?? "").trim();
    const titleNp = String(req.body.titleNp ?? "").trim();
    const bodyEn = String(req.body.bodyEn ?? "").trim();
    const bodyNp = String(req.body.bodyNp ?? "").trim();

    if (!titleEn && !titleNp) {
      return res.status(400).json({
        success: false,
        message: "Notice title is required (English or Nepali)",
      });
    }

    if (!bodyEn && !bodyNp) {
      return res.status(400).json({
        success: false,
        message: "Notice message is required (English or Nepali)",
      });
    }

    const notice = await noticeModel.create({
      titleEn,
      titleNp,
      bodyEn,
      bodyNp,
      postedBy: req.account._id,
    });

    logAdminActivity(
      req.account._id,
      "post_notice",
      `Posted notice: ${titleEn || titleNp}`,
      { noticeId: notice._id }
    );

    res.status(201).json({
      success: true,
      message: "Notice posted to all vendors",
      data: notice,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to post notice",
    });
  }
};

// ── Admin: list all notices ──────────────────────────────────────────
const listNotices = async (req, res) => {
  try {
    const notices = await noticeModel
      .find()
      .populate("postedBy", "name email")
      .sort({ createdAt: -1 });

    res.json({ success: true, data: notices });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to load notices",
    });
  }
};

// ── Admin: delete a notice ───────────────────────────────────────────
const deleteNotice = async (req, res) => {
  try {
    const notice = await noticeModel.findById(req.params.id);
    if (!notice) {
      return res.status(404).json({
        success: false,
        message: "Notice not found",
      });
    }

    await noticeModel.findByIdAndDelete(req.params.id);

    logAdminActivity(
      req.account._id,
      "delete_notice",
      `Deleted notice: ${notice.titleEn || notice.titleNp}`,
      { noticeId: req.params.id }
    );

    res.json({ success: true, message: "Notice deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to delete notice",
    });
  }
};

// ── Vendor: read the notices broadcast to all vendors ────────────────
const listVendorNotices = async (req, res) => {
  try {
    const notices = await noticeModel
      .find()
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({ success: true, data: notices });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to load notices",
    });
  }
};

export { createNotice, listNotices, deleteNotice, listVendorNotices };