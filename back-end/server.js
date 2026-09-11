import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express"
import update from "./dataUpdate/dataUpdate.js";
import cors from "cors";
import helmet from "helmet";
import itemRouter from "./routes/itemRouter.js";
import userRouter from "./routes/userRouter.js";
import adminRouter from "./routes/adminRouter.js";
import orderRouter from "./routes/orderRouter.js";
import vendorRouter from "./routes/vendorRouter.js";
import issueRouter from "./routes/issueRouter.js";
import { loadGateway } from "./gateway/index.js";
import { connectDB } from "./config/db.js";
import { startScheduler } from "./services/priorityScheduler.js";
import logger from "./utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

update();

// load payment gateway configuration from environment variables
try {
  loadGateway();
  logger.info("Payment gateway loaded");
} catch (err) {
  logger.error({ err }, "Payment gateway config error");
}

// connect to database and ensure prime admin exists
connectDB();

// start the priority-search stage-advancement scheduler
// internally waits for the DB connection to be ready
startScheduler();

//app config
const app=express();
const port=4000;

// CORS — restrict to known frontend origins (env-configurable)
const DEFAULT_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
];
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map(o => o.trim()).filter(Boolean)
  : DEFAULT_ORIGINS;

//middleware
app.use(helmet())
app.use(express.json())
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
}))

//api endpoints
app.use("/api/items",itemRouter)
app.use("/api/users",userRouter)
app.use("/api/admins",adminRouter)
app.use("/api/orders",orderRouter)
app.use("/api/vendors",vendorRouter)
app.use("/api/issues",issueRouter)
app.use("/images", (req, res, next) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
}, express.static('uploads'))

// ---------- production static hosting ----------
// All three apps are served from this origin: front-end at /, vendor at
// /vendor, admin at /admin (hidden, noindex). The /vendor and /admin mounts
// must be registered before the root front-end fallback so Express matches
// the more specific paths first. API mounts above always take precedence.
// Express 5 (path-to-regexp v8) requires the named /*splat wildcard in place
// of the legacy bare "*".
app.use("/admin", (req, res, next) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
});
app.use("/admin", express.static(path.resolve(__dirname, "../admin/dist")));
app.get("/admin/*splat", (req, res) =>
  res.sendFile(path.resolve(__dirname, "../admin/dist/index.html"))
);

app.use("/vendor", express.static(path.resolve(__dirname, "../vendor/dist")));
app.get("/vendor/*splat", (req, res) =>
  res.sendFile(path.resolve(__dirname, "../vendor/dist/index.html"))
);

app.use("/", express.static(path.resolve(__dirname, "../front-end/dist")));
// last — SPA fallback for the front-end's client-side routes
app.get("/*splat", (req, res) =>
  res.sendFile(path.resolve(__dirname, "../front-end/dist/index.html"))
);

// Global error-handling middleware — safety net for any error that reaches
// Express without being caught by a route's own try/catch. Does not replace
// per-controller error handling.
app.use((err, req, res, next) => {
  logger.error({ err, path: req.path, method: req.method }, "Unhandled error");
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === "production" ? "Something went wrong" : err.message,
  });
});

app.listen(port,()=>{
    logger.info(`Server is listenin on http://localhost:${port}`)
})