import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const MS_PER_MINUTE = 60 * 1000;

const envInt = (name, fallback) => {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
};

const DEFAULT_WINDOW_MS = 15 * MS_PER_MINUTE;

// Generic, non-revealing 429 body. Deliberately makes no reference to whether
// the attempted identifier (email/phone) exists — the rate-limit response must
// not leak account-existence information.
const RATE_LIMIT_MESSAGE = { success: false, message: "Too many attempts. Please try again later." };

const toJsonHandler = (req, res) => {
  res.status(429).json(RATE_LIMIT_MESSAGE);
};

/**
 * Per-IP+identifier login limiter.
 *
 * The counter key combines the request IP (with IPv6 handled via
 * ipKeyGenerator) with the normalized identifier from the request body
 * (email or phone). Combining IP with the identifier reduces false positives
 * for multiple legitimate users sharing one NAT/corporate IP while still
 * blocking brute-force attempts against a specific account and distributed
 * guesses from a single source.
 */
const createLoginLimiter = (max, windowMs) =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const ip = ipKeyGenerator(req.ip, 56);
      const identifier = String(req.body?.identifier ?? req.body?.email ?? "").trim().toLowerCase();
      return `${ip}|${identifier}`;
    },
    handler: toJsonHandler,
  });

/**
 * Per-IP registration limiter — purposely looser than login so legitimate
 * signup bursts aren't blocked, but fast enough to prevent flooding the
 * publicly-accessible registration endpoints with junk accounts.
 */
const createRegisterLimiter = (max, windowMs) =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip, 56),
    handler: toJsonHandler,
  });

/**
 * Per-IP Google OAuth limiter — keyed by IP only (there is no reusable
 * identifier until the Google credential is verified). Looser than login
 * (default 20/window) because a legitimate client may retry a flaky OAuth
 * handshake a few times, but still blocks token-flooding from one source.
 */
const createGoogleAuthLimiter = (max, windowMs) =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip, 56),
    handler: toJsonHandler,
  });

/**
 * Per-authenticated-user order placement limiter — keyed by req.account._id
 * (NOT IP). This route runs after authUser, so `req.account` is always set;
 * IP-based limiting is the wrong shape for legitimate rapid re-ordering
 * behind a shared NAT. Default 30/window is generous for normal use yet tight
 * enough to stop a scripted spam loop.
 */
const createOrderPlacementLimiter = (max, windowMs) =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => String(req.account?._id ?? ipKeyGenerator(req.ip, 56)),
    handler: toJsonHandler,
  });

// Defaults are tunable via environment variables:
//   LOGIN_RATE_LIMIT_MAX           default 10 attempts / window
//   ADMIN_LOGIN_RATE_LIMIT_MAX     default 5  attempts / window (admin is rarer + higher value)
//   REGISTER_RATE_LIMIT_MAX        default 20 attempts / window
//   GOOGLE_AUTH_RATE_LIMIT_MAX     default 20 attempts / window (per IP)
//   ORDER_PLACEMENT_RATE_LIMIT_MAX default 30 attempts / window (per authenticated user)
//   ISSUE_REPORT_RATE_LIMIT_MAX    default 30 attempts / window (per IP, public endpoint)
//   RATE_LIMIT_WINDOW_MS           default 15 minutes
const windowMs = envInt("RATE_LIMIT_WINDOW_MS", DEFAULT_WINDOW_MS);

export const userLoginLimiter = createLoginLimiter(envInt("LOGIN_RATE_LIMIT_MAX", 10), windowMs);
export const vendorLoginLimiter = createLoginLimiter(envInt("LOGIN_RATE_LIMIT_MAX", 10), windowMs);
export const adminLoginLimiter = createLoginLimiter(envInt("ADMIN_LOGIN_RATE_LIMIT_MAX", 5), windowMs);
export const registerLimiter = createRegisterLimiter(envInt("REGISTER_RATE_LIMIT_MAX", 20), windowMs);
export const googleAuthLimiter = createGoogleAuthLimiter(envInt("GOOGLE_AUTH_RATE_LIMIT_MAX", 20), windowMs);
export const orderPlacementLimiter = createOrderPlacementLimiter(envInt("ORDER_PLACEMENT_RATE_LIMIT_MAX", 30), windowMs);
// Same per-IP pattern as registration — this public endpoint must not become
// a spam/DoS vector, but 30/window is generous enough for real crash reports.
export const issueReportLimiter = createRegisterLimiter(envInt("ISSUE_REPORT_RATE_LIMIT_MAX", 30), windowMs);
