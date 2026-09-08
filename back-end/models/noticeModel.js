import mongoose from "mongoose";

/**
 * A broadcast notice posted by an admin, visible to every vendor.
 *
 * Title/body can be provided in English and/or Nepali — the controller
 * requires at least one language for the title and one for the body.
 * Vendors read the matching language and fall back to the other when only
 * one was provided.
 */
const noticeSchema = new mongoose.Schema({
  titleEn: { type: String, default: "", trim: true },
  titleNp: { type: String, default: "", trim: true },
  bodyEn: { type: String, default: "", trim: true },
  bodyNp: { type: String, default: "", trim: true },
  postedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "admin",
    required: true,
    index: true,
  },
}, { timestamps: true });

noticeSchema.index({ createdAt: -1 });

const noticeModel = mongoose.model("notices", noticeSchema);
export default noticeModel;