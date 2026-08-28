import fs from "fs";
import itemModel from "../models/itemModel.js";
import { addCommodityTranslation } from "../dataUpdate/translateData.js";

const addToApproved = async (req, res) => {
  try {
    const { id } = req.params;

    const item = await itemModel.findById(id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found",
      });
    }

    const updatedItem = await itemModel.findByIdAndUpdate(
      id,
      { status: !item.status },
      { returnDocument: "after" }
    );

    res.json({
      success: true,
      message: updatedItem.status
        ? "Item approved successfully"
        : "Item removed from approved",
      data: updatedItem,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to update approval status",
    });
  }
};

const updateItem = async (req, res) => {
  try {
    const id = req.params.id;

    const item = await itemModel.findById(id);

    if (!item) {
      return res.json({
        success: false,
        message: "Item not found",
      });
    }

    // Keep the existing image if no new image is uploaded
    let newImageFilename = item.image;

    if (req.file) {

      // New image uploaded → use it
      newImageFilename = req.file.filename;

      // Delete old file only if it is not the placeholder
      if (
        item.image &&
        item.image !== "no-preview.jpg"
      ) {
        fs.unlink(
          `uploads/${item.image}`,
          (err) => {
            if (err) {
              console.log(
                "Failed to delete old image:",
                err
              );
            }
          }
        );
      }

    } else if (
      req.body.deleteImage === "true" ||
      req.body.image === "no-preview.jpg"
    ) {

      // Image removed with no replacement
      // → default to placeholder

      if (
        item.image &&
        item.image !== "no-preview.jpg"
      ) {
        fs.unlink(
          `uploads/${item.image}`,
          (err) => {
            if (err) {
              console.log(
                "Failed to delete old image:",
                err
              );
            }
          }
        );
      }

      newImageFilename = "no-preview.jpg";
    }

    // ------------------------------------------
    // Check whether the English name changed
    // ------------------------------------------

    const nameEngChanged =
      item.nameEng !== req.body.nameEng;

    // ------------------------------------------
    // Update database
    // ------------------------------------------

    const updatedItem =
      await itemModel.findByIdAndUpdate(
        id,
        {
          nameEng: req.body.nameEng,
          nameNep: req.body.nameNep,
          minPrice: Number(req.body.minPrice),
          avgPrice: Number(req.body.avgPrice),
          maxPrice: Number(req.body.maxPrice),
          image: newImageFilename,
        },
        {
          returnDocument: "after"
        }
      );

    // ------------------------------------------
    // Update commodityTranslations.json
    // only when nameEng was changed
    // ------------------------------------------

    if (nameEngChanged) {

      addCommodityTranslation(
        updatedItem.nameNep,
        updatedItem.nameEng
      );
    }

    res.json({
      success: true,
      data: updatedItem,
      message: "Item updated",
    });

  } catch (error) {

    console.error(error);

    res.json({
      success: false,
      message: "Error updating item",
    });
  }
};

const listItem = async (req, res) => {
  try {
    const items = await itemModel.find();

    res.json({
      success: true,
      data: items,
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch items",
    });
  }
};

const fetchList = async (req, res) => {
  try {
    // Filter in the database instead of fetching everything then filtering in JS
    const approvedItems = await itemModel.find({ status: true });
    res.json({ success: true, data: approvedItems });
  } catch (error) {
    console.error("FETCH ERROR:", error);
    res.status(500).json({ success: false, message: "Failed to fetch items" });
  }
};

export {
  listItem,
  addToApproved,
  updateItem,
  fetchList
};