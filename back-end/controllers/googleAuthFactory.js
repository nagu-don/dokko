import jwt from "jsonwebtoken";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createHash } from "node:crypto";

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);

const PLACEHOLDER_DOMAIN = "dokko-google-placeholder";

// The phone field is required, unique and must match /^\d{10}$/ (a real
// delivery contact). A brand-new Google account has no phone yet, so we
// derive a deterministic 10-digit placeholder from the Google `sub`.
//
// The generated number is NOT a real contact — callers must depend on the
// `phoneIsPlaceholder` flag (or the legacy /^g\d{9}$/ pattern for
// pre-existing accounts) to detect it, never on the digits themselves.
//
// `salt` lets a duplicate-key collision be retried with a fresh value.
export const makePlaceholderPhone = (sub, salt = 0) => {
  const digest = createHash("sha256")
    .update(`${PLACEHOLDER_DOMAIN}:${sub}:${salt}`, "utf8")
    .digest();
  const value = BigInt("0x" + digest.subarray(0, 8).toString("hex")) % 10000000000n;
  return value.toString(10).padStart(10, "0");
};

// The password field is `required: true`, but Google accounts have no
// password — they authenticate with Google only. Store a deterministic
// non-empty derived string: it satisfies the schema, is stored plaintext so
// bcrypt.compare (email/password login) always fails against it, and is never
// logged or exposed to clients.
export const makeGooglePassword = (sub) => {
  const digest = createHash("sha256")
    .update(`${PLACEHOLDER_DOMAIN}:password:${sub}`, "utf8")
    .digest("hex");
  return `google-${digest}`;
};

const isDuplicateKeyError = (error) => Boolean(error && error.code === 11000);

// A duplicate-key write during account creation is one of two races:
//   1. a parallel request registered the same email first — log them in;
//   2. this placeholder phone collided with another account — retry with a
//      new salt (the phone column has a unique index).
const MAX_PLACEHOLDER_ATTEMPTS = 3;

const createGoogleAccount = async (Model, { name, email, sub }) => {
  for (let attempt = 0; attempt < MAX_PLACEHOLDER_ATTEMPTS; attempt++) {
    try {
      return await Model.create({
        name,
        email,
        phone: makePlaceholderPhone(sub, attempt),
        password: makeGooglePassword(sub),
        phoneIsPlaceholder: true,
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const existing = await Model.findOne({ email });
      if (existing) return existing;
    }
  }
  throw new Error("Could not create Google account after placeholder collisions");
};

const buildGoogleAuthController = (Model) => {
  const googleAuth = async (req, res) => {
    try {
      const { credential } = req.body;
      if (!credential) {
        return res.status(400).json({
          success: false,
          message: "Google credential is required",
        });
      }

      // verify the Google ID token
      const { payload } = await jwtVerify(credential, GOOGLE_JWKS, {
        issuer: ["https://accounts.google.com", "accounts.google.com"],
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const { sub, email, name, picture } = payload;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Google account must have an email",
        });
      }

      // find existing account by email or by Google sub
      let account = await Model.findOne({ email: email.toLowerCase() });

      if (!account) {
        account = await createGoogleAccount(Model, {
          name: name || email.split("@")[0],
          email: email.toLowerCase(),
          sub,
        });
      }

      const token = jwt.sign(
        { id: account._id },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.json({
        success: true,
        message: "Logged in with Google",
        token,
        user: {
          id: account._id,
          name: account.name,
          email: account.email,
          phone: account.phone,
        },
      });
    } catch (error) {
      console.error("Google auth error:", error);
      res.status(401).json({
        success: false,
        message: "Invalid Google credential",
      });
    }
  };

  return { googleAuth };
};

export default buildGoogleAuthController;
