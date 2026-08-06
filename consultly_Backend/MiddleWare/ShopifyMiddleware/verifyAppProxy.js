"use strict";



const crypto = require("crypto");
const { isValidShopDomain } = require("../../Utils/shopValidator");

const timingSafeEqualHex = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
};

const verifyAppProxy = (req, res, next) => {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    console.error("[verifyAppProxy] SHOPIFY_API_SECRET is not configured");
    return res.status(500).send("Server misconfiguration");
  }

  const { signature, ...rest } = req.query;
  if (!signature) {
    return res.status(401).send("Missing app proxy signature");
  }

  // Build the message exactly as Shopify does.
  const message = Object.keys(rest)
    .sort()
    .map((key) => {
      const value = rest[key];
      return `${key}=${Array.isArray(value) ? value.join(",") : value}`;
    })
    .join("");

  const digest = crypto.createHmac("sha256", secret).update(message).digest("hex");

  if (!timingSafeEqualHex(digest, String(signature))) {
    return res.status(401).send("Invalid app proxy signature");
  }

  // Signature is valid → the shop param is now trustworthy, but still validate shape.
  if (req.query.shop && !isValidShopDomain(req.query.shop)) {
    return res.status(400).send("Invalid shop domain");
  }

  next();
};

module.exports = { verifyAppProxy };
