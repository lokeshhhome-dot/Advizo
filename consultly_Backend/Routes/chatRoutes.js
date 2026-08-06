const express = require("express");
const { getChatHistory, getUserInRecentChat } = require("../Controller/chatController");
const { optionalAuthenticateToken } = require("../Auth/signup-signin");
const chatRoutes = express.Router();

chatRoutes.get("/get/chat-history/:shopId/:userId/:consultantId", optionalAuthenticateToken, getChatHistory);
chatRoutes.put("/update-user-request/:shopId/:userId/:consultantId", optionalAuthenticateToken, getUserInRecentChat);

module.exports = chatRoutes;
