const express = require("express");
const rateLimit = require("express-rate-limit");
const { verifyShopifyToken } = require("../MiddleWare/ShopifyMiddleware/verifyShopifyToken");
const { aiChatController } = require("../Controller/aiController");

const aiRoute = express.Router();

// LLM calls are expensive — keep the AI endpoint tightly rate-limited.
const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many requests. Please wait a moment.",
    },
});

aiRoute.post("/chat/:adminId", aiLimiter, verifyShopifyToken, aiChatController);

module.exports = { aiRoute };
