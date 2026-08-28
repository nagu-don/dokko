import express from "express";
import { listItem, addToApproved, updateItem, fetchList } from "../controllers/itemController.js";
import { authAdmin } from "../middleware/authMiddleware.js";
import multer from "multer";

const itemRouter = express.Router();

const storage = multer.diskStorage({
  destination: "uploads",
  filename: (req, file, cb) => {
    return cb(null, `${Date.now()}${file.originalname}`);
  },
});

const upload = multer({ storage: storage });

itemRouter.get("/list", listItem);
itemRouter.get("/list-approved",fetchList)
itemRouter.patch("/approve/:id", authAdmin, addToApproved);
itemRouter.patch("/edit/:id", authAdmin, upload.single("image"), updateItem);

export default itemRouter;