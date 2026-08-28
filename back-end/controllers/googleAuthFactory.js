import jwt from "jsonwebtoken";
import { createRemoteJWKSet, jwtVerify } from "jose";

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);

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
        // generate a placeholder phone so the unique+required constraint is satisfied
        const phone = `g${sub.slice(0, 9)}`;

        account = await Model.create({
          name: name || email.split("@")[0],
          email: email.toLowerCase(),
          phone,
          password: "", // no password for Google accounts
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
