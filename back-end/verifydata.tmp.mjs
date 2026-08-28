import "dotenv/config";
import dns from "node:dns";
dns.setServers(["8.8.8.8", "8.8.4.4"]);
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;
const orders = db.collection("orders");
const userc = db.collection("users");
const itemc = db.collection("items");

const vendRefs = await orders.find({ vendor: { $ne: null } }).toArray();
const orderCount = await orders.countDocuments({});
const userCount = await userc.countDocuments({});
const itemCount = await itemc.countDocuments({});
console.log("orders:", orderCount, "with vendor refs:", vendRefs.length);
console.log("users:", userCount, "items:", itemCount);
if (vendRefs.length) {
  const ids = [...new Set(vendRefs.map(o => String(o.vendor)))];
  console.log("distinct vendor ids referenced:", ids.length, ids.slice(0, 10));
}
await mongoose.disconnect();
