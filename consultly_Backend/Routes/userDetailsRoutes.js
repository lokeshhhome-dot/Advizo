const express = require("express");
const userDetailsRouter = express.Router();
const { getAllUsers, getUserById, getAppStatusController, getUserWalletHistroy, getcallSessionsController, getUserConversationController } = require("../Controller/userDetailsController");
const { tokenVerify, authenticateToken, optionalAuthenticateToken } = require("../Auth/signup-signin");
const { verifyShopifyToken } = require("../MiddleWare/ShopifyMiddleware/verifyShopifyToken");

userDetailsRouter.get("/token", tokenVerify);

userDetailsRouter.get("/user-details", verifyShopifyToken, getAllUsers);
userDetailsRouter.get("/d/:id", optionalAuthenticateToken, getUserById);
userDetailsRouter.get("/app-status-verify-app-status", getAppStatusController);
userDetailsRouter.get("/get/wallet-history/:userId/:shopId", optionalAuthenticateToken, getUserWalletHistroy);
userDetailsRouter.use("/find-call-session", optionalAuthenticateToken, getcallSessionsController);
userDetailsRouter.get("/find-user-logs-history/:id", optionalAuthenticateToken, getUserConversationController);

module.exports = { userDetailsRouter };
