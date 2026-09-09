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

// Defaults are tunable via environment variables:
//   LOGIN_RATE_LIMIT_MAX           default 10 attempts / window
//   ADMIN_LOGIN_RATE_LIMIT_MAX     default 5  attempts / window (admin is rarer + higher value)
//   REGISTER_RATE_LIMIT_MAX        default 20 attempts / window
//   RATE_LIMIT_WINDOW_MS           default 15 minutes
const windowMs = envInt("RATE_LIMIT_WINDOW_MS", DEFAULT_WINDOW_MS);

export const userLoginLimiter = createLoginLimiter(envInt("LOGIN_RATE_LIMIT_MAX", 10), windowMs);
export const vendorLoginLimiter = createLoginLimiter(envInt("LOGIN_RATE_LIMIT_MAX", 10), windowMs);
export const adminLoginLimiter = createLoginLimiter(envInt("ADMIN_LOGIN_RATE_LIMIT_MAX", 5), windowMs);
export const registerLimiter = createRegisterLimiter(envInt("REGISTER_RATE_LIMIT_MAX", 20), windowMs);
