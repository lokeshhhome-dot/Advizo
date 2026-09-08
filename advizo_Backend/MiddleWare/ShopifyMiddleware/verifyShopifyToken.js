const jwt = require("jsonwebtoken");
require("dotenv").config();

const API_KEY = process.env.SHOPIFY_CLIENT_ID || process.env.client_id || "";
const SHOP_HOST_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

/**
 * Verify a Shopify App Bridge session token per Shopify's embedded-app rules:
 *  - HS256 signature with the app secret (algorithm pinned)
 *  - `aud` must equal this app's API key (blocks token reuse across apps)
 *  - `dest` must be a valid *.myshopify.com host
 *  - `exp`/`nbf` enforced by jwt.verify
 */
const verifyShopifyToken = (req, res, next) => {
    try {
        const auth = req.headers.authorization || req.headers.Authorization;
        if (!auth?.startsWith("Bearer ")) {
            return res.status(401).json({ message: "Missing token" });
        }

        const token = auth.split(" ")[1];
        const payload = jwt.verify(token, process.env.SHOPIFY_API_SECRET, {
            algorithms: ["HS256"],
        });

        if (API_KEY && payload.aud !== API_KEY) {
            return res.status(401).json({ message: "Invalid token audience" });
        }

        const host = String(payload.dest || "").replace(/^https?:\/\//, "");
        if (!SHOP_HOST_REGEX.test(host)) {
            return res.status(401).json({ message: "Invalid token destination" });
        }

        req.shop = host;
        req.shopifyUserId = payload.sub;
        next();
    } catch (err) {
        return res.status(401).json({ message: "Invalid Shopify session token" });
    }
};

module.exports = { verifyShopifyToken };
