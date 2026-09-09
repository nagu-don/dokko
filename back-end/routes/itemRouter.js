import { randomUUID } from "node:crypto";
import path from "node:path";
import express from "express";
import { listItem, addToApproved, updateItem, fetchList } from "../controllers/itemController.js";
import { authAdmin } from "../middleware/authMiddleware.js";
import multer from "multer";

const itemRouter = express.Router();

// 5 MB
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

// MIME type -> canonical extension. The stored extension is derived
// from this server-side whitelist, never from the client-supplied name.
const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const ALLOWED_IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
]);

const storage = multer.diskStorage({
  destination: "uploads",
  filename: (req, file, cb) => {
    // Opaque filename — does not incorporate any client-controlled input,
    // so a crafted originalname cannot influence where the file is written.
    const extension = ALLOWED_IMAGE_TYPES[file.mimetype] ?? "";
    return cb(null, `${randomUUID()}${extension}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_IMAGE_TYPES[file.mimetype]) {
    const error = new Error("Only JPG, JPEG, PNG and WebP image files are allowed.");
    error.status = 400;
    return cb(error);
  }

  const clientExtension = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_IMAGE_EXTENSIONS.has(clientExtension)) {
    const error = new Error("Image files must have a .jpg, .jpeg, .png or .webp extension.");
    error.status = 400;
    return cb(error);
  }

  cb(null, true);
};

const upload = multer({
  storage: storage,
  fileFilter,
  limits: { fileSize: MAX_IMAGE_SIZE },
});

itemRouter.get("/list", authAdmin, listItem);
itemRouter.get("/list-approved", fetchList)
itemRouter.patch("/approve/:id", authAdmin, addToApproved);
itemRouter.patch("/edit/:id", authAdmin, upload.single("image"), updateItem);

// Surface multer upload rejections (wrong type / too large) as clear JSON
// errors so the admin UI can show the actual reason instead of a generic 500.
itemRouter.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "Image is too large. The maximum allowed size is 5 MB.",
      });
    }
    return res.status(400).json({
      success: false,
      message: `Image upload failed: ${err.message}`,
    });
  }

  if (err && err.status === 400 && err.message) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  next(err);
});

export default itemRouter;