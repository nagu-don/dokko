import orderModel, { ADDITIONAL_CHARGES, ORDER_STATUSES } from "../models/orderModel.js";
import itemModel from "../models/itemModel.js";
import vendorModel from "../models/vendorModel.js";
import commissionConfigModel from "../models/commissionConfigModel.js";

const round2 = (n) => Math.round(n * 100) / 100;

// Load additional charges from commission config, falling back to the model constant
const getAdditionalCharges = async () => {
  try {
    const config = await commissionConfigModel.findOne();
    if (config) {
      return config.additionalCharges;
    }
  } catch {
    // config collection may not exist yet
  }
  return ADDITIONAL_CHARGES;
};

// USER — place an order from the cart
// body: { items: [{ itemId, quantity }], dropoff: { lat, lng, label? } }
//
// IMPORTANT: deliveryCharge, priorityStage, vendor, and total are NEVER
// read from the request body — they are server-controlled values.
const placeOrder = async (req, res) => {
  try {
    const requested = Array.isArray(req.body.items) ? req.body.items : [];

    const cleaned = requested
      .map((row) => ({
        itemId: row.itemId,
        quantity: Math.round(Number(row.quantity) * 10) / 10,
      }))
      .filter((row) => row.itemId && Number.isFinite(row.quantity) && row.quantity > 0);

    if (cleaned.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cart is empty",
      });
    }

    // delivery drop-off picked on the map — required so vendors can navigate
    const { dropoff } = req.body;
    const lat = Number(dropoff?.lat ?? dropoff?.coordinates?.[1]);
    const lng = Number(dropoff?.lng ?? dropoff?.coordinates?.[0]);

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({
        success: false,
        message: "A valid delivery location is required",
      });
    }

    // snapshot names + prices from the DB so later edits don't rewrite history
    const ids = cleaned.map((row) => row.itemId);
    const dbItems = await itemModel.find({ _id: { $in: ids } });

    const byId = new Map(dbItems.map((item) => [String(item._id), item]));

    const orderItems = [];
    for (const row of cleaned) {
      const dbItem = byId.get(String(row.itemId));

      if (!dbItem) {
        return res.status(400).json({
          success: false,
          message: "One or more items no longer exist",
        });
      }

      orderItems.push({
        item: dbItem._id,
        nameEng: dbItem.nameEng,
        nameNep: dbItem.nameNep || "",
        quantity: row.quantity,
        // pricing is based on the MAX price, same as shown on the site
        priceAtOrder: dbItem.maxPrice,
      });
    }

    const totalQuantity = round2(
      orderItems.reduce((sum, row) => sum + row.quantity, 0)
    );

    const subtotal = round2(
      orderItems.reduce((sum, row) => sum + row.quantity * row.priceAtOrder, 0)
    );

    const additionalCharges = await getAdditionalCharges();

    // deliveryCharge is null — the final charge is determined only after
    // a vendor accepts during one of the priority search stages
    const now = new Date();
    const total = round2(subtotal + additionalCharges);

    const order = await orderModel.create({
      user: req.account._id,
      items: orderItems,
      totalQuantity,
      subtotal,
      deliveryCharge: null,
      additionalCharges,
      total,
      dropoff: {
        type: "Point",
        coordinates: [lng, lat],
        label: String(dropoff?.label || "").slice(0, 200),
      },
      priorityStage: "SEARCHING_0_5KM",
      priorityStartedAt: now,
      priorityExpiresAt: new Date(now.getTime() + 60 * 1000), // 1 min stage window
    });

    res.status(201).json({
      success: true,
      message: "Order placed successfully",
      data: order,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to place order",
    });
  }
};

// ADMIN — list orders (optionally filtered to one user via ?userId=)
const listOrders = async (req, res) => {
  try {
    const filter = {};
    if (req.query.userId) filter.user = req.query.userId;

    const orders = await orderModel
      .find(filter)
      .sort({ createdAt: -1 })
      .populate("user", "name email phone");

    res.json({ success: true, data: orders });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to fetch orders" });
  }
};

// USER — list my own orders
const myOrders = async (req, res) => {
  try {
    const orders = await orderModel
      .find({ user: req.account._id })
      .populate("vendor", "name phone")
      .sort({ createdAt: -1 });

    res.json({ success: true, data: orders });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to fetch order history" });
  }
};

// USER — read the assigned vendor's LIVE location for one of my orders.
//
// SECURITY / AUTHORIZATION (server-authoritative):
//   - `req.account` is the authenticated customer (set by authUser); we
//     verify order.user === req.account._id before returning anything.
//   - The vendor id is derived from the order doc, never from the client.
//   - Tracking is only surfaced while the order is Processing (assigned).
//     Before a vendor accepts (Pending / no vendor), and after the terminal
//     states (Delivered / Cancelled), tracking is disabled and NO live
//     location is returned.
//   - Only the dedicated `liveLocation` field is returned — the static
//     `location` used for geo-matching is NEVER exposed as live.
//   - `lastUpdatedAt` is the server timestamp recorded when the vendor last
//     reported a position, so the UI can show how fresh the data is.
const getOrderVendorLocation = async (req, res) => {
  try {
    const order = await orderModel.findById(req.params.orderId);

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (String(order.user) !== String(req.account._id)) {
      return res.status(403).json({
        success: false,
        message: "You can only track your own orders",
      });
    }

    // Tracking only while an order is assigned and in progress.
    const trackingAllowed =
      order.status === "Processing" && Boolean(order.vendor);

    if (!trackingAllowed) {
      return res.json({
        success: true,
        data: { tracking: false, location: null },
      });
    }

    const vendor = await vendorModel
      .findById(order.vendor, { name: 1, liveLocation: 1 })
      .lean();

    if (!vendor || !vendor.liveLocation || !vendor.liveLocation.coordinates) {
      return res.json({
        success: true,
        data: {
          tracking: true,
          vendor: vendor ? { id: String(vendor._id), name: vendor.name } : null,
          location: null,
        },
      });
    }

    const [lng, lat] = vendor.liveLocation.coordinates;

    res.json({
      success: true,
      data: {
        tracking: true,
        vendor: { id: String(vendor._id), name: vendor.name },
        location: {
          lat,
          lng,
          lastUpdatedAt: vendor.liveLocation.updatedAt
            ? new Date(vendor.liveLocation.updatedAt).toISOString()
            : null,
        },
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to fetch vendor location" });
  }
};

// ADMIN — update an order's status
const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${ORDER_STATUSES.join(", ")}`,
      });
    }

    const updated = await orderModel.findByIdAndUpdate(
      req.params.id,
      { status },
      { returnDocument: "after" }
    ).populate("user", "name email phone");

    if (!updated) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    res.json({
      success: true,
      message: `Order marked as ${status}`,
      data: updated,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to update order" });
  }
};

// ADMIN — list orders filtered by vendor (for vendor detail view)
const listOrdersByVendor = async (req, res) => {
  try {
    const filter = { vendor: req.params.vendorId };

    const orders = await orderModel
      .find(filter)
      .sort({ createdAt: -1 })
      .populate("user", "name email phone");

    res.json({ success: true, data: orders });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to fetch vendor orders" });
  }
};

// PUBLIC — return the additional charges (service fee) applied to every order.
// The frontend uses this instead of hardcoding the value.
const getAdditionalChargesConfig = async (_req, res) => {
  try {
    const charges = await getAdditionalCharges();
    res.json({ success: true, data: { additionalCharges: charges } });
  } catch {
    res.json({ success: true, data: { additionalCharges: ADDITIONAL_CHARGES } });
  }
};

export { placeOrder, listOrders, updateOrderStatus, myOrders, listOrdersByVendor, getAdditionalChargesConfig, getOrderVendorLocation };
